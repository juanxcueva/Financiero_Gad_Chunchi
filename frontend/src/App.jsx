import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OrdenesPago = lazy(() => import('./pages/OrdenesPago'));
const NuevaOrden = lazy(() => import('./pages/NuevaOrden'));
const EditarOrden = lazy(() => import('./pages/EditarOrden'));
const Beneficiarios = lazy(() => import('./pages/Beneficiarios'));
const Configuracion = lazy(() => import('./pages/Configuracion'));
const Auditoria = lazy(() => import('./pages/Auditoria'));

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
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-light-900 dark:bg-dark-900">
            <div className="glass rounded-2xl px-6 py-4 border border-cyan-300/30 dark:border-cyan-400/20">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cargando módulo...</p>
            </div>
          </div>
        }
      >
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
      </Suspense>
    </>
  );
}
