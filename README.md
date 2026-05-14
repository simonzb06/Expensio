# Control de Gastos Familiar

Aplicación web de dashboard para gestión y análisis financiero del hogar.

## Estructura
- `index.html` - página principal
- `styles.css` - estilos responsive
- `app.js` - lógica de frontend con llamadas a la API
- `backend/` - ejemplo de API Node/Express usando SQLite

## Requisitos
- Node.js 14+ para el backend

## Instrucciones
1. Instalar dependencias para backend:
   ```bash
   cd backend
   npm install
   ```
2. Iniciar servidor API:
   ```bash
   npm start
   ```
   El servidor escucha en `http://localhost:3001`.
3. Abrir `index.html` en el navegador (por ejemplo con un servidor estático o doble clic). El frontend usará la API en el puerto 3001.

### Usuarios por defecto
- **Administrador**: nombre `Administrador`, contraseña `admin123` (role admin)
- **Visor**: nombre `Visor`, contraseña `viewer123` (role viewer)

Los usuarios son gestionables mediante la API (`/api/users`).

## Funcionalidades implementadas
- Inicio de sesión con JWT
- Permisos de administrador vs visor
- CRUD básico de tarjetas y registros de gastos
- Visualización de estadísticas y movimientos recientes

## Notas
Esta es una solución de ejemplo orientada al aprendizaje. Para producción se recomienda:
- Agregar un servicio real de base de datos
- Validar y sanitizar entradas
- Usar HTTPS y secretos seguros
- Implementar logout correcto y expiración de tokens
- Mejorar la interfaz y agregar más secciones (gastos, categorías, análisis avanzados)
