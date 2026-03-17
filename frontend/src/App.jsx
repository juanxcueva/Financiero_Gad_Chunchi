import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import OrdenesPago from './pages/OrdenesPago';
import NuevaOrden from './pages/NuevaOrden';
import EditarOrden from './pages/EditarOrden';
import Beneficiarios from './pages/Beneficiarios';
import Configuracion from './pages/Configuracion';
import Auditoria from './pages/Auditoria';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid rgba(0,240,255,0.2)',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/ordenes-pago" element={<OrdenesPago />} />
                  <Route path="/ordenes-pago/nueva" element={<NuevaOrden />} />
                  <Route path="/ordenes-pago/:id/editar" element={<EditarOrden />} />
                  <Route path="/beneficiarios" element={<Beneficiarios />} />
                  <Route path="/configuracion" element={<Configuracion />} />
                  <Route path="/auditoria" element={<Auditoria />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}
