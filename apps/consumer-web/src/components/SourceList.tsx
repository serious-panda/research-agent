interface Props {
  sources: string[]
}

export default function SourceList({ sources }: Props) {
  if (sources.length === 0) return null

  return (
    <div className="source-list">
      <h3>Sources</h3>
      <ol>
        {sources.map((url, i) => (
          <li key={i}>
            <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
          </li>
        ))}
      </ol>
    </div>
  )
}
