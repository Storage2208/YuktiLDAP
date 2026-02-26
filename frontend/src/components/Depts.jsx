import { useEffect, useState, useRef } from "react";
import axios from "axios"; 
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Tag } from 'primereact/tag';

const API_URL = import.meta.env.VITE_API_URL;

export default function Depts({ auth }) {
    const [depts, setDepts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogVisible, setDialogVisible] = useState(false);
    const [newDeptName, setNewDeptName] = useState("");
    
    // Search State
    const [globalFilter, setGlobalFilter] = useState("");
    const toast = useRef(null);

    useEffect(() => {
        fetchDepts();
    }, []);

    const fetchDepts = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/directory/ous-stats`, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            setDepts(res.data);
        } catch (err) {
            console.error("Failed to load depts", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newDeptName.trim()) return;
        try {
            await axios.post(`${API_URL}/api/directory/add-ou`, 
                { ouName: newDeptName }, 
                { headers: { 'Authorization': `Bearer ${auth.token}` } }
            );
            toast.current.show({ severity: 'success', summary: 'Success', detail: 'Department Created' });
            setDialogVisible(false);
            setNewDeptName("");
            fetchDepts();
        } catch (err) {
            toast.current.show({ severity: 'error', summary: 'Error', detail: err.response?.data?.message || "Failed" });
        }
    };

    const confirmDelete = (rowData) => {
        if (rowData.total > 0) {
            toast.current.show({ severity: 'warn', summary: 'Cannot Delete', detail: 'Department contains users!' });
            return;
        }
        confirmDialog({
            message: `Are you sure you want to delete '${rowData.name}'?`,
            header: 'Confirm Deletion',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-danger',
            accept: () => handleDelete(rowData.name)
        });
    };

    const handleDelete = async (ouName) => {
        try {
            await axios.delete(`${API_URL}/api/directory/delete-ou/${ouName}`, {
                headers: { 'Authorization': `Bearer ${auth.token}` }
            });
            toast.current.show({ severity: 'success', summary: 'Deleted', detail: 'Department removed' });
            fetchDepts();
        } catch (err) {
            toast.current.show({ severity: 'error', summary: 'Error', detail: 'Delete failed' });
        }
    };

    // --- TEMPLATES ---
    const totalTemplate = (r) => <span className="font-bold text-gray-700 ml-2">{r.total}</span>;
    const activeTemplate = (r) => <Tag value={r.active} severity={r.active > 0 ? "success" : "secondary"} rounded />;
    const inactiveTemplate = (r) => <Tag value={r.inactive} severity={r.inactive > 0 ? "danger" : "secondary"} rounded />;

    const actionTemplate = (rowData) => (
        <div className="flex gap-2">
            {/* ❌ REMOVED: View Users Button */}
            
            <Button 
                icon="pi pi-trash" 
                rounded 
                text 
                severity="danger" 
                onClick={() => confirmDelete(rowData)} 
                disabled={rowData.total > 0} 
                tooltip="Delete Department"
            />
        </div>
    );

    // Header with Search Only (Export Removed)
    const header = (
        <div className="flex flex-wrap align-items-center justify-between gap-2">
            <h2 className="m-0 text-xl font-bold text-gray-700">Departments List</h2>
            <div className="flex gap-2">
                <span className="p-input-icon-left">
                    <i className="pi pi-search" />
                    <InputText type="search" onInput={(e) => setGlobalFilter(e.target.value)} placeholder="Search..." />
                </span>
                {/* ❌ REMOVED: Export Button */}
            </div>
        </div>
    );

    return (
        <div className="p-6">
            <Toast ref={toast} />
            <ConfirmDialog />
            
            <div className="card bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Manage Departments</h2>
                    <Button label="New Department" icon="pi pi-plus" onClick={() => setDialogVisible(true)} />
                </div>

                <DataTable 
                    value={depts} 
                    loading={loading} 
                    stripedRows 
                    paginator rows={10}
                    globalFilter={globalFilter}
                    header={header}
                    tableStyle={{ minWidth: '50rem' }}
                >
                    <Column field="name" header="Department Name" sortable style={{ fontWeight: 'bold', width: '30%' }}></Column>
                    <Column field="total" header="Total Users" body={totalTemplate} sortable style={{ width: '15%' }}></Column>
                    <Column field="active" header="Active" body={activeTemplate} sortable style={{ width: '15%' }}></Column>
                    <Column field="inactive" header="Inactive" body={inactiveTemplate} sortable style={{ width: '15%' }}></Column>
                    <Column body={actionTemplate} style={{ width: '10%' }}></Column>
                </DataTable>
            </div>

            {/* CREATE DEPT DIALOG */}
            <Dialog header="Create Department" visible={dialogVisible} style={{ width: '350px' }} onHide={() => setDialogVisible(false)}>
                <div className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="dept" className="font-bold text-sm text-gray-700">Department Name</label>
                        <InputText id="dept" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} autoFocus />
                    </div>
                    <div className="flex justify-end gap-2">
                         <Button label="Cancel" icon="pi pi-times" text onClick={() => setDialogVisible(false)} />
                         <Button label="Create" icon="pi pi-check" onClick={handleCreate} />
                    </div>
                </div>
            </Dialog>
        </div>
    );
}