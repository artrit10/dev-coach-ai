export function Comment({ html }: { html: string }) {
  return (
    <div className="comment">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
