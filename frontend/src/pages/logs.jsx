import { useEffect, useState } from "react";
import axios from "axios"; 
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { TabView, TabPanel } from 'primereact/tabview'; // ✅ Import Tabs

export default function Logs({ auth }) {
  const [sessionLogs, setSessionLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
        // Fetch Both Tables
        const [res1, res2] = await Promise.all([
            axios.get("http://localhost:3001/api/directory/logs/sessions", { headers: { 'Authorization': `Bearer ${auth.token}` } }),
            axios.get("http://localhost:3001/api/directory/logs/audits", { headers: { 'Authorization': `Bearer ${auth.token}` } })
        ]);
        setSessionLogs(res1.data);
        setAuditLogs(res2.data);
    } catch (err) {
        console.error("Failed to fetch logs", err);
    } finally {
        setLoading(false);
    }
  };

  const formatTime = (isoString) => {
      if (!isoString) return "-";
      return new Date(isoString).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata', 
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true
      });
  };
  // --- TEMPLATES FOR SESSION LOGS ---
 const timeTemplate = (r) => formatTime(r.login_time || r.active_time);
  const logoutTemplate = (r) => formatTime(r.logout_time);
  
  const typeTemplate = (r) => (
      <Tag value={r.login_type} severity={r.login_type === "LOGIN" ? "success" : "danger"} />
  );
  
  const systemTemplate = (r) => (
      <div className="flex flex-col text-xs">
          <span className="font-bold">{r.browser_name} {r.browser_version}</span>
          <span className="text-gray-500">{r.browser_plateform}</span>
      </div>
  );

  // --- TEMPLATES FOR AUDIT LOGS ---
  const auditTimeTemplate = (r) => formatTime(r.inserted_on);

  

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white p-4 rounded-xl shadow-sm">
        <h2 className="text-xl font-bold text-gray-800 mb-4">System Logs</h2>
        
        <TabView>
            {/* TAB 1: SESSIONS (Login/Logout) */}
            <TabPanel header="User Sessions">
                <DataTable value={sessionLogs} loading={loading} paginator rows={10} stripedRows size="small">
                    <Column field="id" header="ID" sortable style={{ width: '5%' }} />
                    <Column field="ldap_uid" header="User" sortable style={{ width: '10%', fontWeight: 'bold' }} />
                    <Column field="ip_address" header="IP" style={{ width: '10%' }} />
                    <Column header="System" body={systemTemplate} style={{ width: '15%' }} />
                    <Column field="login_type" header="Action" body={typeTemplate} sortable style={{ width: '10%' }} />
                    <Column field="login_time" header="Login Time" body={timeTemplate} sortable style={{ width: '15%' }} />
                    <Column field="logout_time" header="Logout Time" body={logoutTemplate} style={{ width: '10%' }} />
                </DataTable>
            </TabPanel>

            {/* TAB 2: AUDIT (Create/Update) */}
            <TabPanel header="Admin Actions">
                <DataTable value={auditLogs} loading={loading} paginator rows={10} stripedRows size="small">
                    <Column field="id" header="ID" sortable style={{ width: '5%' }} />
                    <Column field="ldap_uid" header="Performed By" sortable style={{ width: '15%', fontWeight: 'bold' }} />
                    <Column field="ip_address" header="IP Address" style={{ width: '15%' }} />
                    <Column field="audit_msg" header="Action Details" style={{ width: '45%' }} />
                    <Column field="inserted_on" header="Time" body={auditTimeTemplate} sortable style={{ width: '20%' }} />
                </DataTable>
            </TabPanel>
        </TabView>

      </div>
    </div>
  );
}