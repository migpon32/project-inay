import HealthWorkerShell from "../components/HealthWorkerShell";
import HealthWorkerMonitoringDesk from "../components/HealthWorkerMonitoringDesk";

export default function HealthWorkerPortal() {
  return (
    <HealthWorkerShell>
      <HealthWorkerMonitoringDesk />
    </HealthWorkerShell>
  );
}
