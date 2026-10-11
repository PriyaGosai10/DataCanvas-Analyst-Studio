import { ReactNode } from "react";
import { BarChart3, FolderKanban, LogOut, Plus, UserCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Layout({children}:{children:ReactNode}) {
  const {user,logout}=useAuth(); const nav=useNavigate();
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BarChart3 size={20}/></div><span>DataCanvas</span></div>
      <nav><button onClick={()=>nav("/")}><FolderKanban size={18}/> Projects</button></nav>
      <div className="sidebar-bottom">
        <div className="user-mini"><UserCircle size={22}/><div><strong>{user?.name}</strong><small>{user?.email}</small></div></div>
        <button className="logout" onClick={()=>{logout();nav("/login")}}><LogOut size={17}/> Sign out</button>
      </div>
    </aside>
    <main className="main-content">{children}</main>
  </div>
}