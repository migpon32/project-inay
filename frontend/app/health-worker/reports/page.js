import HealthWorkerMonitoringDesk from "../../components/HealthWorkerMonitoringDesk";
import HealthWorkerShell from "../../components/HealthWorkerShell";

export default function DynamicReportsPage() {
  return (
    <HealthWorkerShell>
      <HealthWorkerMonitoringDesk reportMode />
    </HealthWorkerShell>
  );
}
