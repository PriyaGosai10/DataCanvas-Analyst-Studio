import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../services/api";

type User = { id:string; name:string; email:string };
type Ctx = { user:User|null; loading:boolean; login:(email:string,password:string)=>Promise<void>; register:(name:string,email:string,password:string)=>Promise<void>; logout:()=>void };

const AuthContext = createContext<Ctx>({} as Ctx);
export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser] = useState<User|null>(() => JSON.parse(localStorage.getItem("datacanvas_user") || "null"));
  const [loading,setLoading] = useState(false);
  async function login(email:string,password:string){ setLoading(true); try { const r=await api.post("/auth/login",{email,password}); localStorage.setItem("datacanvas_token",r.data.token); localStorage.setItem("datacanvas_user",JSON.stringify(r.data.user)); setUser(r.data.user); } finally {setLoading(false);} }
  async function register(name:string,email:string,password:string){ setLoading(true); try { const r=await api.post("/auth/register",{name,email,password}); localStorage.setItem("datacanvas_token",r.data.token); localStorage.setItem("datacanvas_user",JSON.stringify(r.data.user)); setUser(r.data.user); } finally {setLoading(false);} }
  function logout(){ localStorage.removeItem("datacanvas_token"); localStorage.removeItem("datacanvas_user"); setUser(null); }
  useEffect(()=>{ setLoading(false); },[]);
  return <AuthContext.Provider value={{user,loading,login,register,logout}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);