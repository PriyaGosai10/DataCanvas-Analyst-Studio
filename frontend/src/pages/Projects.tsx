import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout";
import { Plus, FolderOpen, Trash2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

type ProjectItem = {
  _id: string;
  name: string;
  description?: string;
  updatedAt?: string;
};

function messageFromError(error: any): string {
  if (error?.response?.data?.message) return String(error.response.data.message);
  if (error?.response?.status === 401) return "Your session has expired. Please log out and sign in again.";
  if (error?.code === "ERR_NETWORK") return "Cannot reach the DataCanvas API. Make sure the backend is running at http://localhost:5000 and MongoDB is connected.";
  return error?.message || "Something went wrong. Please try again.";
}

export default function Projects() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/projects");
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Enter a project name before clicking Create.");
      return;
    }
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await api.post("/projects", { name: cleanName });
      const created = response.data;
      if (!created?._id) {
        throw new Error("The API did not return a project ID. Check the backend terminal for errors.");
      }
      setName("");
      setShow(false);
      setProjects(current => [created, ...current.filter(p => p._id !== created._id)]);
      nav(`/projects/${created._id}`);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this project and its related dashboards and datasets?")) return;
    setError("");
    try {
      await api.delete(`/projects/${id}`);
      setProjects(current => current.filter(project => project._id !== id));
    } catch (err) {
      setError(messageFromError(err));
    }
  }

  return (
    <Layout>
      <header className="topbar">
        <div><h1>Projects</h1><p>Your analytics workspace</p></div>
        <button className="primary" onClick={() => { setError(""); setShow(true); }}>
          <Plus size={18} /> New project
        </button>
      </header>

      {error && (
        <div role="alert" style={{ margin: "12px 0", padding: "12px 14px", border: "1px solid #e5a2a2", borderRadius: 10, background: "#fff1f1", color: "#8b1d1d" }}>
          <strong>Could not complete the action.</strong>
          <div style={{ marginTop: 4 }}>{error}</div>
          <button style={{ marginTop: 8 }} onClick={() => void load()}><RefreshCw size={14} /> Retry loading projects</button>
        </div>
      )}

      {show && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Create project</h2>
            <p>Give this workspace a clear name, such as Sales Analytics or Research Dashboard.</p>
            <form onSubmit={event => { event.preventDefault(); void create(); }}>
              <input
                autoFocus
                placeholder="Project name"
                value={name}
                maxLength={100}
                onChange={event => setName(event.target.value)}
              />
              <div className="modal-actions">
                <button type="button" onClick={() => { setShow(false); setError(""); }}>Cancel</button>
                <button type="submit" className="primary" disabled={creating}>
                  {creating ? "Creating…" : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="project-grid">
        {loading ? (
          <div className="empty"><p>Loading projects…</p></div>
        ) : projects.map(project => (
          <article className="project-card" key={project._id}>
            <div className="project-icon"><FolderOpen /></div>
            <div className="project-info" role="button" tabIndex={0}
              onClick={() => nav(`/projects/${project._id}`)}
              onKeyDown={event => { if (event.key === "Enter") nav(`/projects/${project._id}`); }}>
              <h3>{project.name}</h3>
              <p>{project.description || "Analytics project"}</p>
              <small>Updated {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "just now"}</small>
            </div>
            <button className="icon-btn danger" aria-label={`Delete ${project.name}`} onClick={() => void remove(project._id)}>
              <Trash2 size={17} />
            </button>
          </article>
        ))}
        {!loading && projects.length === 0 && !error && (
          <div className="empty">
            <FolderOpen size={42} />
            <h2>No projects yet</h2>
            <p>Create your first project and upload a dataset.</p>
            <button className="primary" onClick={() => setShow(true)}><Plus size={18} /> Create project</button>
          </div>
        )}
      </section>
    </Layout>
  );
}
