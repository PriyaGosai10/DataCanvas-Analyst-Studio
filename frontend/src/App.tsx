import { Navigate,Route,Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Projects from "./pages/Projects";
import Project from "./pages/Project";
import Dataset from "./pages/Dataset";
import Dashboard from "./pages/Dashboard";
import Shared from "./pages/Shared";

function Protected({children}:{children:JSX.Element}){const {user}=useAuth();return user?children:<Navigate to="/login" replace/>}
export default function App(){return <Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/" element={<Protected><Projects/></Protected>}/><Route path="/projects/:id" element={<Protected><Project/></Protected>}/><Route path="/datasets/:id" element={<Protected><Dataset/></Protected>}/><Route path="/dashboards/:id" element={<Protected><Dashboard/></Protected>}/><Route path="/shared/:token" element={<Shared/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}