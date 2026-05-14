La Unión - API ejemplo (Control de Gastos Familiar)

Instrucciones rápidas:

1) Instalar dependencias

```bash
cd backend
npm install
```

2) Ejecutar el servidor (por defecto en puerto 3001)

```bash
npm start
```

La API crea automáticamente un archivo SQLite `la_union.db` en la carpeta `backend` y semillas mínimas (usuarios y tarjetas).

Endpoints principales:
- `POST /api/login` - obtener token JWT con {name,password}
- `GET /api/health` - health check (sin auth)
- `GET /api/users` - lista de usuarios (admin)
- `POST /api/users` - crear usuario {name, role, password} (admin)
- `GET /api/cards` - lista de tarjetas (cualquier usuario)
- `POST /api/cards` - crear tarjeta {holder, last4, type, balance} (admin)
- `PUT /api/cards/:id` - actualizar tarjeta (admin)
- `DELETE /api/cards/:id` - eliminar tarjeta (admin)
- `GET /api/transactions` - lista movimientos (acepta filtros query: cardId,userId,category) (autenticado)
- `POST /api/transactions` - crear movimiento {date,desc,category,userId,cardId,amount} (admin)
- `GET /api/transactions/:id` - obtener movimiento por id (autenticado)

Notas:
- Este es un ejemplo didáctico: en producción debe añadirse autenticación, validaciones avanzadas, manejo de errores y backups.
- El proyecto asume que la UI frontend consumirá estos endpoints para persistir y consultar datos reales.
