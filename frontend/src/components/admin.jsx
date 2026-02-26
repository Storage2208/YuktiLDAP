import { useEffect, useState, useRef } from "react";
import axios from "axios"; 
import { getOUs, getUsersByOU, editUser } from "../api"; 
import { Toast } from 'primereact/toast'; 
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom"; 

// PRIME REACT IMPORTS
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Avatar } from 'primereact/avatar';
import { InputSwitch } from 'primereact/inputswitch'; 
import { Dialog } from 'primereact/dialog'; 
import { MultiSelect } from 'primereact/multiselect'; 
import { Dropdown } from 'primereact/dropdown';
import { SplitButton } from 'primereact/splitbutton'; 
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Badge } from 'primereact/badge'; 

const API_URL = import.meta.env.VITE_API_URL;

export default function Admin({ auth }) {
  const toast = useRef(null);
  const navigate = useNavigate();

  const hasWriteAccess = auth.canWrite || 
                         (auth.role && ["SUPER_ADMIN", "ADMIN"].includes(auth.role.toUpperCase()));
  
  // DATA STATES
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  
  const [selectedDeptFilter, setSelectedDeptFilter] = useState([]); 
  const [selectedRoleFilter, setSelectedRoleFilter] = useState(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState(null);
  const [ous, setOus] = useState([]); 

  // DIALOG STATES
  const [productDialog, setProductDialog] = useState(false); 
  const [viewDialog, setViewDialog] = useState(false);     
  const [viewData, setViewData] = useState(null);           
  const [conflictDialog, setConflictDialog] = useState(false);
  const [conflictMsg, setConflictMsg] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkReport, setBulkReport] = useState({ success: 0, failed: 0, errors: [] });
  const fileUploadRef = useRef(null);

  const [searchParams] = useSearchParams();

  const urlToken = searchParams.get("token");

  const initialForm = { 
    firstName: "", lastName: "", email: "", secondaryEmail: "", 
    mobile: "", uid: "", password: "", department: "", title: "", 
    role: "USER", permissions: [] 
  };

  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadAllData();
    if (urlToken ) {
        console.log("URL Token found:", urlToken);
    }
    
  }, [urlToken]);

  const loadAllData = async () => {
    setLoading(true);
    try {
        const ouData = await getOUs(auth);
        setOus(ouData.map(name => ({ label: name, value: name }))); 

        const userData = await getUsersByOU("all", auth, Date.now());
        
        const processed = userData.map(u => ({
            ...u,
            status: (Array.isArray(u.employeeType) ? u.employeeType[0] : u.employeeType || "ACTIVE").toUpperCase(),
            role: (Array.isArray(u.businessCategory) ? u.businessCategory[0] : u.businessCategory || "USER").toUpperCase(),
            cn: Array.isArray(u.cn) ? u.cn[0] : u.cn,
            uid: Array.isArray(u.uid) ? u.uid[0] : u.uid,
            email: Array.isArray(u.mail) ? u.mail[0] : u.mail, 
            department: u.department || "General",
            // Ensure timestamp exists for sorting
            createTimestamp: u.createTimestamp || "00000000000000Z" 
        }));

        //  Sort Newest Users to Top (Descending)
        // Uses string comparison on ISO timestamps
        processed.sort((a, b) => {
            const timeA = a.createTimestamp || "";
            const timeB = b.createTimestamp || "";
            if (timeA < timeB) return 1; // B is newer -> Put B first
            if (timeA > timeB) return -1; // A is newer -> Put A first
            return 0;
        });

        setUsers(processed);
    } catch (err) {
        console.error("Load failed", err);
    } finally {
        setLoading(false);
    }
  };

  // --- FILTER LOGIC ---
  const getFilteredUsers = () => {
      return users.filter(u => {
          // 1. Dept Filter (Safe check for empty array)
          if (selectedDeptFilter && selectedDeptFilter.length > 0 && !selectedDeptFilter.includes(u.department)) return false;
          // 2. Role Filter
          if (selectedRoleFilter && u.role !== selectedRoleFilter) return false;
          // 3. Status Filter
          if (selectedStatusFilter && u.status !== selectedStatusFilter) return false;
          
          return true;
      });
  };

  const filteredData = getFilteredUsers(); 

  // --- STATUS TOGGLE HANDLER ---
  const handleToggle = async (user) => {
    if (!hasWriteAccess) return;
    const currentStatus = user.status;
    const newStatus = currentStatus === "ACTIVE" ? "inactive" : "active"; 
    setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: newStatus.toUpperCase() } : u));
    
    try {
        await editUser({ uid: user.uid, employeeType: newStatus }, auth);
        toast.current.show({ severity: 'success', summary: 'Updated', detail: `User is now ${newStatus}`, life: 1000 });
    } catch (err) {
        setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: currentStatus } : u));
        toast.current.show({ severity: 'error', summary: 'Error', detail: 'Update failed' });
    }
  };

  const openNew = () => { setFormData(initialForm); setSelectedFile(null); setEditMode(false); setProductDialog(true); };
  const hideDialog = () => { setProductDialog(false); setViewDialog(false); };
  const openView = (user) => { setViewData(user); setViewDialog(true); };
  
  // Pre-fill form for editing, with robust handling of missing/array fields and permissions parsing
  const handleEditClick = (u) => {
    setEditMode(true);
    setSelectedFile(null);
    const names = u.cn ? u.cn.split(" ") : ["", ""];
    let permArray = [];
    let rawPerms = u.departmentNumber;
    if (Array.isArray(rawPerms)) {
        const allowString = rawPerms.find(s => s && s.toString().startsWith("ALLOW:"));
        if (allowString) rawPerms = allowString;
    }
    if (rawPerms && typeof rawPerms === "string" && rawPerms.startsWith("ALLOW:")) {
        permArray = rawPerms.replace("ALLOW:", "").split(",").map(s => s.trim());
    }
    setFormData({
      firstName: names[0] || "", lastName: u.sn || names.slice(1).join(" ") || "",
      email: u.email || "", secondaryEmail: u.secondaryEmail || "", 
      mobile: u.mobile || "", uid: u.uid || "", password: "", department: u.department || "", title: u.title || "",
      role: u.role || "USER", permissions: permArray  
    });
    setProductDialog(true); 
  };

  // --- ADD/EDIT SUBMIT HANDLER ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    const isAdd = !editMode;
    const url = isAdd ? `${API_URL}/v1/directory/add` : `${API_URL}/v1/directory/edit`;
    try {
        const data = new FormData();
        Object.keys(formData).forEach(key => {
            if (key === "permissions") {
                 if (formData.permissions.length > 0 && ["ADMIN", "SUPER_ADMIN"].includes(formData.role)) {
                     data.append("permissions", "ALLOW:" + formData.permissions.join(","));
                 }
            } else if (key === "password") {
                if (formData.password) data.append("password", formData.password);
            } else { data.append(key, formData[key]); }
        });
        if (selectedFile) data.append("photo", selectedFile);

        await axios[isAdd ? 'post' : 'put'](url, data, {
            headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'multipart/form-data' }
        });
        toast.current.show({ severity: 'success', summary: 'Success', detail: 'Saved Successfully' });
        setProductDialog(false);
        loadAllData();
    } catch (err) {
        if (err.response?.status === 400) { setConflictMsg(err.response.data.message); setConflictDialog(true); } 
        else { toast.current.show({ severity: 'error', summary: 'Error', detail: 'Operation Failed' }); }
    }
  };

  // --- BULK IMPORT HANDLER ---
  const handleBulkImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);
    try {
        const response = await axios.post(`${API_URL}/v1/directory/bulk`, formData, {
            headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'multipart/form-data' }
        });
        setBulkReport(response.data.summary);
        setBulkDialog(true);
        loadAllData();
    } catch (err) {
        toast.current.show({ severity: 'error', summary: 'Import Failed', detail: err.message });
    } finally {
        setLoading(false);
        e.target.value = null;
    }
  };

  // Export Handler with Proper Filename and Error Handling
  const handleExport = async () => {
    try {
        const response = await axios.get(`${API_URL}/v1/directory/export`, {
            headers: { 'Authorization': `Bearer ${auth.token}` },
            responseType: 'blob', 
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Directory_Users_${new Date().toISOString().split('T')[0]}.xlsx`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (err) { 
        console.error("Export failed:", err);
        toast.current.show({ severity: 'error', summary: 'Export Error', detail: 'Could not download file. Is Backend running?' });
    }
  };

  // CONFIRM DELETE
  const confirmDelete = (user) => { confirmDialog({ message: `Delete ${user.uid}?`, header: 'Confirm', icon: 'pi pi-exclamation-triangle', acceptClassName: 'p-button-danger', accept: () => handleDelete(user) }); };
  
  // DELETE USER
  const handleDelete = async (user) => { 
      try { await axios.delete(`${API_URL}/v1/directory/delete/${user.uid}`, { headers: { 'Authorization': `Bearer ${auth.token}` } }); toast.current.show({ severity: 'success', summary: 'Deleted', detail: 'User removed' }); loadAllData(); } catch (err) { toast.current.show({ severity: 'error', summary: 'Error', detail: 'Delete Failed' }); }
  };

  // --- TEMPLATES ---
  const userBodyTemplate = (r) => (
      <div className="flex align-items-center gap-3">
          <Avatar image={`${API_URL}/uploads/${r.uid}.jpg?t=${Date.now()}`} icon="pi pi-user" shape="circle" size="large" className="bg-blue-50 text-blue-500" onError={(e) => { e.target.src = ''; e.target.style.display = 'none'; }} />
          <div className="flex flex-col">
              <span className="font-bold text-gray-800 text-sm">{r.cn}</span>
              <span className="text-xs text-gray-500">{r.uid}</span>
          </div>
      </div>
  );

  // Role with Color Coding
  const roleBodyTemplate = (r) => <Tag value={r.role} severity={r.role === "SUPER_ADMIN" ? "danger" : r.role === "ADMIN" ? "warning" : "info"} />;
 
  //  Status Toggle with Text
  const statusBodyTemplate = (r) => (
      <div className="flex items-center gap-2">
        <InputSwitch checked={r.status === "ACTIVE"} onChange={() => handleToggle(r)} disabled={!hasWriteAccess} />
        <span className={`text-xs font-bold ${r.status === "ACTIVE" ? 'text-green-600' : 'text-gray-400'}`}>{r.status}</span>
      </div>
  );

  // Action Buttons: View always, Edit/Delete only if hasWriteAccess
  const actionBodyTemplate = (r) => (
      <div className="flex gap-2">
          <Button icon="pi pi-eye" rounded text severity="info" onClick={() => openView(r)} />
          {hasWriteAccess && (
              <>
                  <Button icon="pi pi-pencil" rounded text severity="secondary" onClick={() => handleEditClick(r)} />
                  <Button icon="pi pi-trash" rounded text severity="danger" onClick={() => confirmDelete(r)} />
              </>
          )}
      </div>
  );

  // --- HEADER SECTION ---
  const header = (
    <div className="flex flex-col gap-4 p-2">
        {/* TOP BAR: Title, Stats, Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-800 m-0">Directory Users</h2>
                <Badge value={filteredData.length} severity="info" className="text-sm font-bold"></Badge>
            </div>
            
            <div className="flex gap-2">
                 {hasWriteAccess && (
                    <>
                        <Button label="Add User" icon="pi pi-plus" size="small" onClick={openNew} />
                        
                        {(auth.role || "").toUpperCase() === "SUPER_ADMIN" && (
                            <Button label="Manage Depts" icon="pi pi-sitemap" size="small" severity="help" outlined onClick={() => navigate("/departments")} />
                        )}

                        <SplitButton label="Actions" icon="pi pi-cog" model={[
                                { label: 'Import Excel', icon: 'pi pi-upload', command: () => fileUploadRef.current.click() },
                                { label: 'Export Excel', icon: 'pi pi-download', command: handleExport }
                            ]} severity="secondary" outlined size="small"
                        />
                         <input type="file" ref={fileUploadRef} style={{ display: 'none' }} accept=".xlsx, .xls, .csv" onChange={handleBulkImport} />
                    </>
                 )}
            </div>
        </div>

        {/* 🔍 FILTER BAR */}
        <div className="flex flex-wrap gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
             <span className="p-input-icon-left grow">
                <i className="pi pi-search" />
                <InputText type="search" onInput={(e) => setGlobalFilter(e.target.value)} placeholder="Search Name, ID, Email..." className="w-full" />
            </span>
            
            {/* ✅ FIX: Department Filter uses [] default */}
            <MultiSelect 
                value={selectedDeptFilter} 
                onChange={(e) => setSelectedDeptFilter(e.value || [])} 
                options={ous} 
                optionLabel="label" 
                optionValue="value" 
                placeholder="Filter Depts" 
                display="chip" 
                showClear 
                className="w-60" 
            />
            
            <Dropdown value={selectedRoleFilter} onChange={(e) => setSelectedRoleFilter(e.value)} options={[{label: 'Super Admin', value: 'SUPER_ADMIN'}, {label: 'Admin', value: 'ADMIN'}, {label: 'User', value: 'USER'}]} showClear placeholder="Role" className="w-32" />
            <Dropdown value={selectedStatusFilter} onChange={(e) => setSelectedStatusFilter(e.value)} options={[{label: 'Active', value: 'ACTIVE'}, {label: 'Inactive', value: 'INACTIVE'}]} showClear placeholder="Status" className="w-32" />
        </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <Toast ref={toast} position="top-right" />
      <ConfirmDialog />
      
      {/* ERROR DIALOG */}
      <Dialog visible={conflictDialog} onHide={() => setConflictDialog(false)} header="Error" modal footer={<Button label="OK" severity="danger" onClick={() => setConflictDialog(false)} />} style={{ width: '400px' }}>
         <div className="flex align-items-center gap-3">
            <i className="pi pi-exclamation-triangle text-red-500 text-4xl" />
            <div><p className="font-bold text-gray-800 text-lg">Input Conflict</p><p className="text-gray-600 mt-1">{conflictMsg}</p></div>
         </div>
      </Dialog>
      
      {/* MAIN TABLE */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <DataTable 
                value={filteredData} 
                loading={loading} paginator rows={10} 
                globalFilter={globalFilter} header={header} 
                emptyMessage="No users found." 
                stripedRows tableStyle={{ minWidth: '60rem' }}
                sortField="createTimestamp" 
                sortOrder={-1} 
            >
                {/*  */}
                <Column field="department" header="Department" body={(r) => <span className="text-blue-600 font-bold text-xs">{r.department}</span>} sortable></Column>
                <Column header="User" body={userBodyTemplate} sortable field="cn"></Column>
                <Column header="Role" body={roleBodyTemplate} sortable field="role"></Column>
                <Column header="Status" body={statusBodyTemplate} sortable field="status"></Column>
                <Column body={actionBodyTemplate}></Column>
            </DataTable>
      </div>

      {/* USER FORM DIALOG */}
      <Dialog visible={productDialog} style={{ width: '35rem' }} header={editMode ? "Edit User" : "Add New User"} modal className="p-fluid" onHide={hideDialog}>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="flex justify-center mb-4">
                     <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center w-full bg-gray-50 hover:bg-gray-100 transition cursor-pointer relative">
                        <input type="file" accept="image/*" onChange={(e) => setSelectedFile(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <i className="pi pi-camera text-2xl text-gray-400 mb-2"></i>
                        <p className="text-sm text-gray-500 font-bold">{selectedFile ? selectedFile.name : "Click to Upload Photo"}</p>
                     </div>
            </div>
            <div className="field">
                <label className="font-bold text-xs uppercase text-gray-500">Department</label>
                <Dropdown value={formData.department} onChange={(e) => setFormData({...formData, department: e.value})} options={ous} optionLabel="label" optionValue="value" placeholder="Select Department" disabled={editMode} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">First Name</label> <InputText type="text" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} required className="w-full"/> </div>
                <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Last Name</label> <InputText type="text" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} required className="w-full"/> </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Primary Email</label> <InputText type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required className="w-full"/> </div>
                <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Secondary Email</label> <InputText type="email" value={formData.secondaryEmail} onChange={(e) => setFormData({...formData, secondaryEmail: e.target.value})} placeholder="Optional" className="w-full"/> </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">User ID</label> <InputText type="text" value={formData.uid} onChange={(e) => setFormData({...formData, uid: e.target.value})} disabled={editMode} className={`w-full ${editMode ? 'bg-gray-100' : ''}`} required /> </div>
                <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Mobile</label> <InputText type="tel" maxLength={10} value={formData.mobile} onChange={(e) => { const val = e.target.value.replace(/\D/g, '').slice(0, 10); setFormData({...formData, mobile: val}); }} className="w-full" /> </div>
            </div>
            <div className="field"> <label className="font-bold text-xs uppercase text-gray-500">Password</label> <InputText type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder={editMode ? "Enter Password" : "Enter Password"} className="w-full"/> </div>
            
            <div className="field bg-blue-50 p-3 rounded-lg border border-blue-100">
                <label className="font-bold text-xs uppercase text-blue-600 block mb-2">Access Level</label>
                <Dropdown value={formData.role} onChange={(e) => setFormData({...formData, role: e.value})} options={[{label: 'Standard User', value: 'USER'}, {label: 'Admin', value: 'ADMIN'}, {label: 'Super Admin', value: 'SUPER_ADMIN'}]} placeholder="Select Role" className="w-full"/>
                {(formData.role === "ADMIN" || formData.role === "SUPER_ADMIN") && (
                    <div className="mt-3">
                        <label className="font-bold text-xs uppercase text-blue-600 block mb-1">Allowed Departments</label>
                        <MultiSelect value={formData.permissions} options={ous} onChange={(e) => setFormData({...formData, permissions: e.value})} optionLabel="label" optionValue="value" placeholder="Select Departments" display="chip" className="w-full bg-white" />
                    </div>
                )}
            </div>
            <div className="flex gap-2 justify-end mt-4">
                <Button label="Cancel" icon="pi pi-times" outlined onClick={hideDialog} type="button" className="p-button-secondary" />
                <Button label="Save User" icon="pi pi-check" type="submit" className="p-button-primary" />
            </div>
        </form>
      </Dialog>
      
      {/* USER VIEW DIALOG */}
       <Dialog visible={viewDialog} style={{ width: '30rem' }} header="User Profile" modal onHide={hideDialog} className="p-fluid">
            {viewData && (
                <div className="flex flex-col items-center">
                    <div className="mb-6 text-center">
                        <Avatar image={`${API_URL}/uploads/${viewData.uid}.jpg?t=${Date.now()}`} icon="pi pi-user" size="xlarge" shape="circle" className="w-24 h-24 mb-2 shadow-lg border-2 border-white" />
                        <h2 className="text-2xl font-bold text-gray-800">{viewData.cn}</h2>
                       <Tag value={viewData.role} severity={viewData.role === 'SUPER_ADMIN' ? 'danger' : viewData.role === 'ADMIN' ? 'warning' : 'info'} />
                    </div>
                    <div className="w-full bg-gray-50 p-4 rounded-lg space-y-3 border border-gray-200">
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500 text-sm font-bold">User ID</span>
                            <span className="text-gray-800 font-mono">{viewData.uid}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500 text-sm font-bold">Department</span>
                            <span className="text-blue-600 font-bold">{viewData.department}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500 text-sm font-bold">Email</span>
                            <span className="text-gray-800">{viewData.email}</span>
                        </div>
                        {viewData.secondaryEmail && (
                             <div className="flex justify-between border-b pb-2">
                                <span className="text-gray-500 text-sm font-bold">Secondary Email</span>
                                <span className="text-gray-800 italic">{viewData.secondaryEmail}</span>
                            </div>
                        )}
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500 text-sm font-bold">Mobile</span>
                            <span className="text-gray-800">{viewData.mobile || "N/A"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500 text-sm font-bold">Account Status</span>
                            <Tag value={viewData.status} severity={viewData.status === 'ACTIVE' ? 'success' : 'danger'} />
                        </div>
                        
                        {viewData.departmentNumber && viewData.departmentNumber.toString().includes("ALLOW") && (
                             <div className="mt-3 pt-2 border-t border-gray-300">
                                <span className="text-gray-500 text-xs font-bold block mb-1">ACCESS PERMISSIONS</span>
                                <p className="text-xs text-gray-600 break-word bg-white p-2 rounded border">
                                    {viewData.departmentNumber.toString().replace("ALLOW:", "").split(",").join(", ")}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
       </Dialog>
      
      {/* BULK IMPORT RESULTS */}
      <Dialog visible={bulkDialog} onHide={() => setBulkDialog(false)} header="Bulk Import Results" modal style={{ width: '500px' }}>
        <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center bg-gray-100 p-3 rounded">
                <div className="text-center">
                    <span className="block text-2xl font-bold text-green-600">{bulkReport.success}</span>
                    <span className="text-xs font-bold text-gray-500 uppercase">Success</span>
                </div>
                <div className="text-center">
                    <span className="block text-2xl font-bold text-red-600">{bulkReport.failed}</span>
                    <span className="text-xs font-bold text-gray-500 uppercase">Failed</span>
                </div>
            </div>
            {bulkReport.errors.length > 0 && (
                <div className="max-h-60 overflow-y-auto border p-2 rounded bg-red-50 text-xs">
                    <ul className="list-disc pl-4 space-y-1 text-red-600">
                        {bulkReport.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                </div>
            )}
            <Button label="Close" onClick={() => setBulkDialog(false)} />
        </div>
      </Dialog>
    </div>
  );
}