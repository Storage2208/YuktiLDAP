import { useEffect, useState } from "react";
import { getUsersByOU } from "../api";

// PRIME REACT IMPORTS
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Avatar } from 'primereact/avatar';

const API_URL = import.meta.env.VITE_API_URL;

const UserList = ({ ou, auth }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");

  // --- DATA FETCHING ---
  useEffect(() => {
    if (ou && ou !== "undefined") {
      fetchUsers(ou);
    }
  }, [ou]);

  // Fetch users based on the selected OU and process the data for display
  const fetchUsers = async (targetOU) => {
    setLoading(true);
    try {
      const data = await getUsersByOU(targetOU, auth, Date.now());
      
      const processed = data.map(u => ({
        ...u,
        cn: Array.isArray(u.cn) ? u.cn[0] : u.cn,
        uid: Array.isArray(u.uid) ? u.uid[0] : u.uid,
        mail: Array.isArray(u.mail) ? u.mail[0] : u.mail,
        mobile: Array.isArray(u.mobile) ? u.mobile[0] : u.mobile,
      }));

      setUsers(processed);
    } catch (err) {
      console.error("Failed to load users", err);
    } finally {
      setLoading(false);
    }
  };

  // --- UI TEMPLATES ---

  //  User Profile (Avatar + Name ONLY)
  const userBodyTemplate = (rowData) => (
    <div className="flex align-items-center gap-3">
        <Avatar 
         image={`${API_URL}/uploads/${rowData.uid}.jpg?t=${Date.now()}`}
            icon="pi pi-user" 
            shape="circle" 
            size="large" 
            className="bg-blue-50 text-blue-500"
            onError={(e) => { e.target.src = ''; e.target.style.display = 'none'; }}
        />
        <span className="font-bold text-gray-800">{rowData.cn}</span>
    </div>
  );

  // 2. Contact Info (Email)
  const emailBodyTemplate = (rowData) => (
      <span className="text-gray-600 font-medium">{rowData.mail}</span>
  );

  // 3. Header with Search Bar
  const header = (
    <div className="flex flex-wrap align-items-center justify-between gap-2 p-1">
        <span className="text-xl text-gray-800 font-bold">Directory List</span>
        <span className="p-input-icon-left">
            <i className="pi pi-search" />
            <InputText 
                type="search" 
                onInput={(e) => setGlobalFilter(e.target.value)} 
                placeholder="Search colleagues..." 
                className="p-inputtext-sm w-64" 
            />
        </span>
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <DataTable 
                value={users} 
                loading={loading}
                paginator rows={10} 
                globalFilter={globalFilter}
                header={header}
                emptyMessage="No users found in this department."
                stripedRows
                tableStyle={{ minWidth: '50rem' }}
                className="p-datatable-sm"
            >
                <Column header="Employee" body={userBodyTemplate} sortable field="cn" style={{ width: '40%' }}></Column>
                <Column header="Email" body={emailBodyTemplate} field="mail" sortable style={{ width: '35%' }}></Column>
                <Column field="mobile" header="Mobile" style={{ width: '25%' }}></Column>
            </DataTable>
        </div>
    </div>
  );
};

export default UserList;