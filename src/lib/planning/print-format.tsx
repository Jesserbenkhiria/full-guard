/** Split "LASTNAME Firstname" into printable lines. */
export function splitAgentNameForPrint(agentName: string): {
  lastName: string;
  firstName: string | null;
} {
  const trimmed = agentName.trim();
  if (!trimmed) return { lastName: "—", firstName: null };

  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return { lastName: parts[0], firstName: null };

  return {
    lastName: parts[0],
    firstName: parts.slice(1).join(" "),
  };
}

export function PrintAgentName({ agentName }: { agentName: string }) {
  const { lastName, firstName } = splitAgentNameForPrint(agentName);

  return (
    <div className="print-agent-name">
      <span className="print-agent-last">{lastName}</span>
      {firstName ? <span className="print-agent-first">{firstName}</span> : null}
    </div>
  );
}
