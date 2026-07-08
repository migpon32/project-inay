import ConsultationWorkspace from "../../components/ConsultationWorkspace";
import HealthWorkerShell from "../../components/HealthWorkerShell";

export default function TelehealthMessagesPage() {
  return (
    <HealthWorkerShell>
      <ConsultationWorkspace mode="worker" />
    </HealthWorkerShell>
  );
}
