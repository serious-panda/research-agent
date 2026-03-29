interface Props {
  sources: string[]
}

export default function SourceList({ sources }: Props) {
  if (sources.length === 0) return null

  return (
    <div className="border border-slate-200 rounded-lg px-6 py-5 bg-white shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
        Sources
      </h3>
      <ol className="pl-5 list-decimal flex flex-col gap-1.5">
        {sources.map((url, i) => (
          <li key={i} className="text-sm">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline underline-offset-2 break-all hover:text-blue-800"
            >
              {url}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
