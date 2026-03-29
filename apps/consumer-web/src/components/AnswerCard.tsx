import ReactMarkdown from 'react-markdown'

interface Props {
  answer: string
}

export default function AnswerCard({ answer }: Props) {
  return (
    <div className="border border-slate-200 rounded-lg p-6 bg-white shadow-sm">
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
        Answer
      </h2>
      <div className="answer-body text-slate-800">
        <ReactMarkdown>{answer}</ReactMarkdown>
      </div>
    </div>
  )
}
