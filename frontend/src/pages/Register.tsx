import { FormEvent,useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate,Link } from "react-router-dom";
export default function Register(){
 const {register}=useAuth(); const nav=useNavigate(); const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState("");
 async function submit(e:FormEvent){e.preventDefault();setError("");try{await register(name,email,password);nav("/")}catch(err:any){setError(err.response?.data?.message||"Unable to register")}}
 return <div className="auth-page"><div className="auth-card"><div className="brand auth-brand">DataCanvas</div><h1>Create your workspace</h1><p>Start building analytics dashboards.</p>{error&&<div className="error">{error}</div>}<form onSubmit={submit}><label>Full name<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={6} required/></label><button className="primary wide">Create account</button></form><p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p></div></div>
}