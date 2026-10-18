// Batch integrity jobs: run by the cron route, the operator CLI, and (for one subject) after each submission.
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalies, contributorTrust, experiences, reviewEvents } from "@/db/schema";
import { newId } from "../ids";
import {
  betaTrust,
  BURST,
  decay,
  expectedDaily,
  groupScore,
  isBurst,
  LOCKSTEP,
  lockstepGroups,
  polarityShift,
  recordWeight,
  type LockstepPair,
  type Polarity,
} from "./behavior";
import { pruneRequestSignals, refreshIpRanges } from "./network-db";

// Overall polarity of a record from its observations, computed in SQL.
const POLARITY = sql.raw(`(select case when s > 0 then 'positive' when s < 0 then 'negative' else 'mixed' end
  from (select coalesce(sum(case o->>'polarity' when 'positive' then 1 when 'negative' then -1 else 0 end), 0) s
        from jsonb_array_elements(e.observations) o) p)`);

type Finding = {
  key: string;
  kind: "burst" | "polarity_shift" | "lockstep" | "shared_infrastructure";
  subjectId: string | null;
  polarity: string | null;
  windowStart: Date;
  windowEnd: Date;
  observed: number;
  expected: number | null;
  pValue: number | null;
  score: number;
  experienceIds: string[];
  submitterKeys: string[];
  details: Record<string, unknown>;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

// Upsert keeps a moderator's confirmed/dismissed status while refreshing the evidence.
async function saveFindings(findings: Finding[]) {
  const db = getDb();
  for (const f of findings) {
    await db
      .insert(anomalies)
      .values({ id: newId("anm"), ...f })
      .onConflictDoUpdate({
        target: anomalies.key,
        set: {
          windowEnd: f.windowEnd,
          observed: f.observed,
          expected: f.expected,
          pValue: f.pValue,
          score: f.score,
          experienceIds: f.experienceIds,
          submitterKeys: f.submitterKeys,
          details: f.details,
          updatedAt: new Date(),
        },
      });
  }
}

// Volume bursts and polarity shifts per subject over the last 24 hours. Every non-rejected submission
// counts, including held ones: a bomb that the queue caught is still a bomb.
export async function detectSubjectBursts(subjectIds?: string[]) {
  const db = getDb();
  const now = new Date();
  const windowStart = new Date(now.getTime() - BURST.windowHours * 3600_000);
  const baselineStart = new Date(windowStart.getTime() - BURST.baselineDays * 86_400_000);
  const filter = subjectIds?.length ? sql`and e.subject_id in ${subjectIds}` : sql``;
  const { rows } = await db.execute<{
    subject_id: string;
    polarity: Polarity;
    window_count: number;
    baseline_count: number;
    ids: string[];
    keys: string[];
  }>(sql`
    with r as (
      select e.id, e.subject_id, e.submitter_key, e.created_at, ${POLARITY} as polarity
      from experiences e
      where e.status <> 'rejected' and e.created_at > ${baselineStart} ${filter}
        and e.subject_id in (select subject_id from experiences where created_at > ${windowStart} and status <> 'rejected')
    )
    select subject_id, polarity,
      count(*) filter (where created_at > ${windowStart})::int as window_count,
      count(*) filter (where created_at <= ${windowStart})::int as baseline_count,
      coalesce(array_agg(id) filter (where created_at > ${windowStart}), '{}') as ids,
      coalesce(array_agg(distinct submitter_key) filter (where created_at > ${windowStart}), '{}') as keys
    from r group by subject_id, polarity`);
  if (!rows.length) return [];

  const [global] = (
    await db.execute<{ rate: number }>(sql`
      select (count(*)::float / greatest(1, (select count(*) from subjects)) / ${BURST.baselineDays}) as rate
      from experiences where status <> 'rejected' and created_at between ${baselineStart} and ${windowStart}`)
  ).rows;
  const globalRate = Number(global?.rate ?? 0) / 3;

  const bySubject = new Map<string, typeof rows>();
  for (const r of rows) bySubject.set(r.subject_id, [...(bySubject.get(r.subject_id) ?? []), r]);

  const findings: Finding[] = [];
  for (const [subjectId, groups] of bySubject) {
    const windowTotal = groups.reduce((a, g) => a + g.window_count, 0);
    const baselineTotal = groups.reduce((a, g) => a + g.baseline_count, 0);
    for (const g of groups) {
      if (g.polarity === "mixed" || !g.window_count) continue;
      const lambda = expectedDaily(g.baseline_count, globalRate);
      const burst = isBurst(g.window_count, lambda);
      const shift = polarityShift(g.window_count, windowTotal, g.baseline_count, baselineTotal);
      const base = {
        subjectId,
        polarity: g.polarity,
        windowStart,
        windowEnd: now,
        observed: g.window_count,
        experienceIds: g.ids,
        submitterKeys: g.keys,
      };
      if (burst.burst) {
        findings.push({
          ...base,
          key: `burst:${subjectId}:${g.polarity}:${day(now)}`,
          kind: "burst",
          expected: lambda,
          pValue: burst.p,
          score: Math.min(1, -Math.log10(Math.max(burst.p, 1e-12)) / 12),
          details: { baseline_count: g.baseline_count, distinct_submitters: g.keys.length },
        });
      }
      if (shift.shift) {
        findings.push({
          ...base,
          key: `polarity_shift:${subjectId}:${g.polarity}:${day(now)}`,
          kind: "polarity_shift",
          expected: shift.baselineShare * windowTotal,
          pValue: shift.p,
          score: Math.min(1, shift.share - shift.baselineShare + 0.3),
          details: { share: shift.share, baseline_share: shift.baselineShare, window_total: windowTotal },
        });
      }
    }
  }
  await saveFindings(findings);
  return findings;
}

// Submitter pairs that hit the same subjects with the same polarity within 72 hours, at least three times.
export async function detectLockstep(days = 30) {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const { rows } = await db.execute<{
    a: string;
    b: string;
    shared: number;
    gap_hours: number;
    similarity: number;
    ids: string[];
    subjects: string[];
  }>(sql`
    with r as (
      select e.id, e.subject_id, e.submitter_key, e.created_at, e.search_text, ${POLARITY} as polarity
      from experiences e where e.status <> 'rejected' and e.created_at > ${since}
    )
    select x.submitter_key a, y.submitter_key b,
      count(distinct x.subject_id)::int shared,
      avg(abs(extract(epoch from x.created_at - y.created_at)) / 3600)::float gap_hours,
      avg(similarity(x.search_text, y.search_text))::float similarity,
      array_agg(distinct x.id) || array_agg(distinct y.id) ids,
      array_agg(distinct x.subject_id) subjects
    from r x join r y
      on x.subject_id = y.subject_id and x.submitter_key < y.submitter_key and x.polarity = y.polarity
     and x.polarity <> 'mixed'
     and abs(extract(epoch from x.created_at - y.created_at)) < ${LOCKSTEP.maxGapHours * 3600}
    group by 1, 2 having count(distinct x.subject_id) >= ${LOCKSTEP.minSharedSubjects}`);
  if (!rows.length) return [];

  const pairs: LockstepPair[] = rows.map((r) => ({
    a: r.a,
    b: r.b,
    sharedSubjects: r.shared,
    meanGapHours: r.gap_hours,
    textSimilarity: r.similarity,
  }));
  const findings: Finding[] = [];
  for (const members of lockstepGroups(pairs)) {
    const inGroup = rows.filter((r) => members.includes(r.a) && members.includes(r.b));
    const ids = [...new Set(inGroup.flatMap((r) => r.ids))];
    const subjectIds = [...new Set(inGroup.flatMap((r) => r.subjects))];
    const [stats] = (
      await db.execute<{ total: number; new_members: number; first: Date; last: Date }>(sql`
        select
          (select count(*)::int from experiences where subject_id in ${subjectIds} and status <> 'rejected'
             and created_at > ${since}) total,
          (select count(*)::int from (select submitter_key, min(created_at) m from experiences
             where submitter_key in ${members} group by 1) f where f.m > now() - interval '14 days') new_members,
          (select min(created_at) from experiences where id in ${ids}) first,
          (select max(created_at) from experiences where id in ${ids}) last`)
    ).rows;
    const indicators = {
      size: members.length,
      meanGapHours: inGroup.reduce((a, r) => a + r.gap_hours, 0) / inGroup.length,
      textSimilarity: inGroup.reduce((a, r) => a + r.similarity, 0) / inGroup.length,
      subjectShare: stats.total ? ids.length / stats.total : 0,
      newMemberShare: stats.new_members / members.length,
    };
    const score = groupScore(indicators);
    if (score < LOCKSTEP.flagScore) continue;
    findings.push({
      key: `lockstep:${members.join("|").slice(0, 400)}`,
      kind: "lockstep",
      subjectId: subjectIds.length === 1 ? subjectIds[0] : null,
      polarity: null,
      windowStart: new Date(stats.first),
      windowEnd: new Date(stats.last),
      observed: ids.length,
      expected: null,
      pValue: null,
      score,
      experienceIds: ids,
      submitterKeys: members,
      details: { ...indicators, subjects: subjectIds },
    });
  }
  await saveFindings(findings);
  return findings;
}

// Several identities writing about one subject from the same /24 or /48 within a week. AI-platform
// egress ranges are excluded: every Claude.ai or ChatGPT user shares them.
export async function detectSharedInfrastructure(minSubmitters = 3) {
  const db = getDb();
  const { rows } = await db.execute<{
    subject_id: string;
    prefix_hash: string;
    submitters: string[];
    ids: string[];
    first: Date;
    last: Date;
  }>(sql`
    select e.subject_id, s.prefix_hash,
      array_agg(distinct s.submitter_key) submitters, array_agg(distinct e.id) ids,
      min(s.created_at) first, max(s.created_at) last
    from request_signals s join experiences e on e.id = s.experience_id
    where s.action = 'submit' and s.created_at > now() - interval '7 days'
      and s.network_class not in ('platform_anthropic', 'platform_openai')
    group by 1, 2 having count(distinct s.submitter_key) >= ${minSubmitters}`);
  const findings: Finding[] = rows.map((r) => ({
    key: `shared_infrastructure:${r.subject_id}:${r.prefix_hash}`,
    kind: "shared_infrastructure",
    subjectId: r.subject_id,
    polarity: null,
    windowStart: new Date(r.first),
    windowEnd: new Date(r.last),
    observed: r.ids.length,
    expected: null,
    pValue: null,
    score: Math.min(1, 0.4 + 0.1 * r.submitters.length),
    experienceIds: r.ids,
    submitterKeys: r.submitters,
    details: { distinct_submitters: r.submitters.length },
  }));
  await saveFindings(findings);
  return findings;
}

// Beta reputation per submitter. Good: published, unflagged records older than a week. Bad: rejections,
// flags and confirmed manipulation. Old evidence fades by 2% a week.
export async function updateTrust() {
  const db = getDb();
  const { rows } = await db.execute<{
    submitter_key: string;
    records: { status: string; flags: number; age_weeks: number; confirmed: boolean }[];
    verified: boolean;
  }>(sql`
    select e.submitter_key,
      json_agg(json_build_object(
        'status', e.status, 'flags', e.flag_count,
        'age_weeks', extract(epoch from now() - e.created_at) / 604800,
        'confirmed', exists (select 1 from anomalies a where a.status = 'confirmed' and e.id = any(a.experience_ids))
      )) records,
      bool_or(c.inkbox_verified_at is not null) verified
    from experiences e left join contributors c on c.id = e.contributor_id
    group by e.submitter_key`);
  const values = rows.map((r) => {
    let good = 0;
    let bad = 0;
    for (const rec of r.records) {
      const d = decay(rec.age_weeks);
      if (rec.confirmed) bad += 2 * d;
      else if (rec.status === "rejected") bad += d;
      else if (rec.flags > 0) bad += Math.min(rec.flags, 3) * d;
      else if (rec.status === "published" && rec.age_weeks >= 1) good += d;
    }
    return { submitterKey: r.submitter_key, ...betaTrust(good, bad, Boolean(r.verified)), updatedAt: new Date() };
  });
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(contributorTrust)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: contributorTrust.submitterKey,
        set: {
          alpha: sql`excluded.alpha`,
          beta: sql`excluded.beta`,
          trust: sql`excluded.trust`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  // Submitters whose records were all deleted keep no score.
  await db.execute(sql`delete from contributor_trust t
    where not exists (select 1 from experiences e where e.submitter_key = t.submitter_key)`);
  return values.length;
}

// Recomputes every non-rejected record's ranking weight from trust, content risk and anomalies.
export async function updateWeights() {
  const db = getDb();
  const { rows } = await db.execute<{
    id: string;
    weight: number;
    trust: number | null;
    risk: number | null;
    level: number | null;
    new_account: boolean;
  }>(sql`
    with flagged as (
      select unnest(experience_ids) id,
        max(case status when 'confirmed' then 2 when 'detected' then 1 else 0 end) level
      from anomalies where status <> 'dismissed' and score >= ${LOCKSTEP.flagScore} group by 1
    ), first_seen as (
      select submitter_key, min(created_at) first from experiences group by 1
    )
    select e.id, e.integrity_weight weight, t.trust, e.risk_score risk, f.level,
      (fs.first > now() - interval '7 days' and e.created_at < fs.first + interval '24 hours') new_account
    from experiences e
    left join contributor_trust t on t.submitter_key = e.submitter_key
    left join flagged f on f.id = e.id
    left join first_seen fs on fs.submitter_key = e.submitter_key
    where e.status <> 'rejected'`);
  const changed = rows
    .map((r) => ({
      id: r.id,
      old: r.weight,
      weight: recordWeight({
        trust: r.trust ?? 0.5,
        contentRisk: r.risk,
        anomaly: r.level === 2 ? "confirmed" : r.level === 1 ? "detected" : "none",
        newAccount: Boolean(r.new_account),
      }),
    }))
    .filter((r) => Math.abs(r.old - r.weight) > 0.0005);
  for (let i = 0; i < changed.length; i += 1000) {
    const chunk = changed.slice(i, i + 1000).map(({ id, weight }) => ({ id, weight }));
    await db.execute(sql`
      update experiences e set integrity_weight = v.weight
      from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) as v(id text, weight real)
      where e.id = v.id`);
  }
  return changed.length;
}

// Strong lockstep groups made of low-trust submitters go back to the review queue. Bursts only lower
// weight and raise a notice: a burst can be real news, a ring of fresh accounts writing alike rarely is.
export async function quarantineGroups() {
  const db = getDb();
  const groups = await db
    .select()
    .from(anomalies)
    .where(and(eq(anomalies.kind, "lockstep"), eq(anomalies.status, "detected"), sql`${anomalies.score} >= ${LOCKSTEP.quarantineScore}`));
  let moved = 0;
  for (const g of groups) {
    if (!g.experienceIds.length) continue;
    const held = await db
      .update(experiences)
      .set({
        status: "pending_review",
        reasonCodes: sql`array_append(${experiences.reasonCodes}, 'coordinated_activity')`,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(experiences.id, g.experienceIds),
          eq(experiences.status, "published"),
          sql`coalesce((select trust from contributor_trust t where t.submitter_key = ${experiences.submitterKey}), 0.5) < 0.6`,
        ),
      )
      .returning({ id: experiences.id });
    if (held.length) {
      await db.insert(reviewEvents).values(
        held.map((h) => ({
          experienceId: h.id,
          actor: "evaluator" as const,
          outcome: "pending_review" as const,
          reasonCodes: ["coordinated_activity"],
          note: `Lockstep group ${g.id}`,
        })),
      );
    }
    moved += held.length;
  }
  return moved;
}

export type SweepReport = Record<string, unknown>;

export async function runSweep(opts: { refreshRanges?: boolean } = {}): Promise<SweepReport> {
  const report: SweepReport = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    const started = Date.now();
    try {
      const result = await fn();
      report[name] = Array.isArray(result) ? result.length : result;
    } catch (err) {
      report[name] = `failed: ${(err as Error).message}`;
    }
    report[`${name}_ms`] = Date.now() - started;
  };
  if (opts.refreshRanges !== false) await step("ip_ranges", () => refreshIpRanges());
  await step("bursts", () => detectSubjectBursts());
  await step("lockstep", () => detectLockstep());
  await step("shared_infrastructure", () => detectSharedInfrastructure());
  await step("trust", () => updateTrust());
  await step("weights", () => updateWeights());
  await step("quarantined", () => quarantineGroups());
  await step("pruned_signals", () => pruneRequestSignals());
  return report;
}

// Active, unresolved findings for one subject, newest first; used for notices and inline holds.
export async function activeAnomalies(subjectId: string, hours = 48) {
  return getDb()
    .select({
      id: anomalies.id,
      kind: anomalies.kind,
      polarity: anomalies.polarity,
      windowStart: anomalies.windowStart,
      windowEnd: anomalies.windowEnd,
      observed: anomalies.observed,
      status: anomalies.status,
    })
    .from(anomalies)
    .where(
      and(
        eq(anomalies.subjectId, subjectId),
        inArray(anomalies.status, ["detected", "confirmed"]),
        sql`${anomalies.windowEnd} > now() - make_interval(hours => ${hours})`,
      ),
    )
    .orderBy(sql`${anomalies.windowEnd} desc`);
}
