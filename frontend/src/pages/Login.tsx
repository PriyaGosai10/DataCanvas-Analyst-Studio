import { FormEvent,useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate,Link } from "react-router-dom";
export default function Login(){
 const {login}=useAuth(); const nav=useNavigate(); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState("");
 async function submit(e:FormEvent){e.preventDefault();setError("");try{await login(email,password);nav("/")}catch(err:any){setError(err.response?.data?.message||"Unable to sign in")}}
 return <div className="auth-page"><div className="auth-card"><div className="brand auth-brand">DataCanvas</div><h1>Welcome back</h1><p>Turn your data into decisions.</p>{error&&<div className="error">{error}</div>}<form onSubmit={submit}><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required/></label><button className="primary wide">Sign in</button></form><p className="auth-switch">New here? <Link to="/register">Create an account</Link></p></div></div>
}