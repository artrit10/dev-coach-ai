import type { Review } from "./App";
import { RichText } from "./RichText";

const SEVERITIES = ["high", "medium", "low"] as const;

export function ReviewResults({ review, redacted }: { review: Review; redacted: number }) {
  const counts = SEVERITIES.map((severity) => ({
    severity,
    count: review.findings.filter((f) => f.severity === severity).length,
  }));

  return (
    <section aria-label="Review" className="results">
      {redacted > 0 && (
        <p className="notice">
          {redacted === 1 ? "1 possible secret was" : `${redacted} possible secrets were`} hidden before your code was
          sent to the AI. If it was a real credential, rotate it.
        </p>
      )}

      <div className="summary-card">
        <h2>Summary</h2>
        <p>{review.summary}</p>
        <div className="counts">
          {review.findings.length === 0 ? (
            <span className="count none">No findings</span>
          ) : (
            counts
              .filter((c) => c.count > 0)
              .map((c) => (
                <span key={c.severity} className={`count ${c.severity}`}>
                  {c.count} {c.severity}
                </span>
              ))
          )}
        </div>
      </div>

      {review.findings.length > 0 && (
        <ol className="findings">
          {review.findings.map((f) => (
            <li key={f.id} className={`finding ${f.severity}`}>
              <div className="finding-head">
                <span className="finding-id" aria-label={`Finding ${f.id}`}>{f.id}</span>
                <h3>{f.title}</h3>
                <span className={`badge ${f.severity}`}>{f.severity}</span>
                {f.line !== null && <span className="line-pill">line {f.line}</span>}
              </div>
              <RichText text={f.explanation} />
              <div className="recommendation">
                <strong>Recommendation</strong>
                <RichText text={f.recommendation} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
