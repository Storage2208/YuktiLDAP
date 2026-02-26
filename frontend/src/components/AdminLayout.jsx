import React from "react";
import { Tag } from "primereact/tag";
import Admin from "./admin";

export default function AdminLayout({ auth, handleLogout }) {
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <Admin auth={auth} />
    </div>
  );
}