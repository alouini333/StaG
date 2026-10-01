import { Chat } from "@/components/Chat";

export default function Home() {
  return (
    <>
      <Chat />
      <footer className="disclaimer">
        <p>
          <strong>Hinweis:</strong> Dieser Assistent liefert allgemeine Informationen, keine Rechtsberatung. Das
          Staatsangehörigkeitsrecht kann sich ändern. Klären Sie Ihren Einzelfall mit der zuständigen Einbürgerungsbehörde
          oder einer Anwältin / einem Anwalt.
        </p>
        <p>
          <strong>Note:</strong> This assistant provides general information, not legal advice. Citizenship law can change.
          Confirm your individual case with the competent naturalisation authority (Einbürgerungsbehörde) or a lawyer.
        </p>
      </footer>
    </>
  );
}
