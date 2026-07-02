type Props = { params: { slug: string } };
export default function TemplateAliasDetail({ params }: Props) {
  return <main className="hero"><h1>Soundtrack page moved</h1><p>Use the soundtrack route for this prepared pattern.</p><p><a className="btn primary" href={`/soundtracks/${params.slug}`}>Open soundtrack</a></p></main>;
}
