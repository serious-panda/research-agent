import ReactMarkdown from 'react-markdown'

interface Props {
  answer: string
}

export default function AnswerCard({ answer }: Props) {
  return (
    <div className="answer-card">
      <h2>Answer</h2>
      <div className="answer-body">
        <ReactMarkdown>{answer}</ReactMarkdown>
      </div>
    </div>
  )
}
