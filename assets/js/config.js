/* ==========================================================================
   LavaMili · Configuración del negocio, catálogo y operadores
   Todo lo editable del sistema vive aquí: precios, horarios, mensajes.
   ========================================================================== */

const CONFIG = {
  negocio: {
    nombre: 'LavaMili',
    rubro: 'Lavandería & tintorería',
    direccion: 'Av. Los Álamos 245, Lima',
    telefono: '+51 987 654 321',
    codigoPais: '51',
    // Días de atención: 0 = domingo, 1 = lunes ... 6 = sábado
    horario: { apertura: '08:00', cierre: '20:00', dias: [1, 2, 3, 4, 5, 6] },
    notaHorario: 'Lunes a sábado, 8:00 a. m. a 8:00 p. m.'
  },

  // Turnos de proceso. `horas` se usa para sugerir la fecha de recojo.
  tiempos: [
    { id: 'express', nombre: 'Express · 6 horas', horas: 6 },
    { id: 'normal', nombre: 'Normal · 24 horas', horas: 24 },
    { id: 'dosdias', nombre: 'Dos días · 48 horas', horas: 48 },
    { id: 'tresdias', nombre: 'Tres días · 72 horas', horas: 72 }
  ],

  pagos: ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Transferencia'],

  estados: [
    { id: 'recibido', nombre: 'En proceso', clase: 'warn' },
    { id: 'listo', nombre: 'Listo', clase: 'ok' },
    { id: 'almacen', nombre: 'En almacén', clase: 'info' },
    { id: 'entregado', nombre: 'Entregado', clase: 'neutral' }
  ],

  // Ubicaciones de resguardo para prendas no recogidas.
  // El operador puede elegir una o escribir un código propio.
  almacenes: [
    { codigo: 'ALM-A1', nombre: 'Estante A · nivel 1' },
    { codigo: 'ALM-A2', nombre: 'Estante A · nivel 2' },
    { codigo: 'ALM-B1', nombre: 'Estante B · nivel 1' },
    { codigo: 'ALM-B2', nombre: 'Estante B · nivel 2' },
    { codigo: 'ALM-C1', nombre: 'Colgador C' },
    { codigo: 'ALM-D1', nombre: 'Depósito · caja 1' },
    { codigo: 'ALM-D2', nombre: 'Depósito · caja 2' }
  ],

  // Operadores con acceso al mostrador.
  operadores: [
    { usuario: 'mili', pin: '1234', nombre: 'Mili Rojas', rol: 'Administradora' },
    { usuario: 'mostrador', pin: '2024', nombre: 'Karla Ruiz', rol: 'Operadora' }
  ],

  categorias: [
    { id: 'todos', nombre: 'Todos' },
    { id: 'peso', nombre: 'Por peso' },
    { id: 'ternos', nombre: 'Ternos' },
    { id: 'camisas', nombre: 'Camisas' },
    { id: 'prendas', nombre: 'Prendas' },
    { id: 'hogar', nombre: 'Hogar' },
    { id: 'calzado', nombre: 'Calzado' },
    { id: 'extras', nombre: 'Extras' }
  ],

  servicios: [
    // --- Servicios por peso (se pesan frente al cliente) ---
    { id: 'peso_lavado', cat: 'peso', nombre: 'Lavado por peso', tipo: 'peso', tarifa: 6.5, unidad: 'kg', minPeso: 2, detalle: 'Ropa de casa y diaria · mínimo 2 kg' },
    { id: 'peso_lavado_secado', cat: 'peso', nombre: 'Lavado + secado por peso', tipo: 'peso', tarifa: 9, unidad: 'kg', minPeso: 2, detalle: 'Servicio completo · mínimo 2 kg' },
    { id: 'peso_planchado', cat: 'peso', nombre: 'Planchado por peso', tipo: 'peso', tarifa: 7.5, unidad: 'kg', minPeso: 2, detalle: 'Ropa planchada y doblada' },

    // --- Ternos ---
    { id: 'terno_completo', cat: 'ternos', nombre: 'Terno completo', tipo: 'unidad', tarifa: 28, unidad: 'und', detalle: 'Saco + pantalón' },
    { id: 'terno_incompleto', cat: 'ternos', nombre: 'Terno incompleto', tipo: 'unidad', tarifa: 17, unidad: 'und', detalle: 'Solo saco o solo pantalón' },
    { id: 'terno_tres', cat: 'ternos', nombre: 'Terno 3 piezas', tipo: 'unidad', tarifa: 34, unidad: 'und', detalle: 'Saco + pantalón + chaleco' },
    { id: 'chaleco', cat: 'ternos', nombre: 'Chaleco', tipo: 'unidad', tarifa: 10, unidad: 'und', detalle: 'Lavado y planchado' },

    // --- Camisas ---
    { id: 'camisa', cat: 'camisas', nombre: 'Camisa', tipo: 'unidad', tarifa: 8, unidad: 'und', detalle: 'Lavado y planchado' },
    { id: 'blusa', cat: 'camisas', nombre: 'Blusa', tipo: 'unidad', tarifa: 8, unidad: 'und', detalle: 'Lavado y planchado' },
    { id: 'polo', cat: 'camisas', nombre: 'Polo / camiseta', tipo: 'unidad', tarifa: 7, unidad: 'und', detalle: 'Lavado y doblado' },

    // --- Prendas ---
    { id: 'pantalon', cat: 'prendas', nombre: 'Pantalón', tipo: 'unidad', tarifa: 9, unidad: 'und', detalle: 'Lavado y planchado' },
    { id: 'jean', cat: 'prendas', nombre: 'Jean', tipo: 'unidad', tarifa: 10, unidad: 'und', detalle: 'Lavado y planchado' },
    { id: 'falda', cat: 'prendas', nombre: 'Falda', tipo: 'unidad', tarifa: 9, unidad: 'und', detalle: 'Lavado y planchado' },
    { id: 'vestido', cat: 'prendas', nombre: 'Vestido', tipo: 'unidad', tarifa: 14, unidad: 'und', detalle: 'Lavado y planchado' },
    { id: 'vestido_fiesta', cat: 'prendas', nombre: 'Vestido de fiesta', tipo: 'unidad', tarifa: 22, unidad: 'und', detalle: 'Cuidado especial' },
    { id: 'casaca', cat: 'prendas', nombre: 'Casaca / abrigo', tipo: 'unidad', tarifa: 18, unidad: 'und', detalle: 'Lavado en seco' },
    { id: 'plumifugo', cat: 'prendas', nombre: 'Plumífugo', tipo: 'unidad', tarifa: 30, unidad: 'und', detalle: 'Lavado técnico' },

    // --- Hogar ---
    { id: 'edredon_1', cat: 'hogar', nombre: 'Edredón 1 plaza', tipo: 'unidad', tarifa: 25, unidad: 'und', detalle: 'Lavado y secado' },
    { id: 'edredon_2', cat: 'hogar', nombre: 'Edredón 2 plazas', tipo: 'unidad', tarifa: 35, unidad: 'und', detalle: 'Lavado y secado' },
    { id: 'frazada', cat: 'hogar', nombre: 'Frazada / cobija', tipo: 'unidad', tarifa: 18, unidad: 'und', detalle: 'Lavado y secado' },
    { id: 'cortina', cat: 'hogar', nombre: 'Cortina (por m²)', tipo: 'unidad', tarifa: 12, unidad: 'm²', detalle: 'Se cobra por metro cuadrado' },
    { id: 'alfombra', cat: 'hogar', nombre: 'Alfombra (por m²)', tipo: 'unidad', tarifa: 12, unidad: 'm²', detalle: 'Lavado profundo' },

    // --- Calzado ---
    { id: 'zapatillas', cat: 'calzado', nombre: 'Zapatillas (par)', tipo: 'unidad', tarifa: 15, unidad: 'par', detalle: 'Lavado y desodorizado' },
    { id: 'zapato_cuero', cat: 'calzado', nombre: 'Zapato de cuero (par)', tipo: 'unidad', tarifa: 18, unidad: 'par', detalle: 'Limpieza y crema' },

    // --- Extras ---
    { id: 'planchado', cat: 'extras', nombre: 'Planchado por unidad', tipo: 'unidad', tarifa: 5, unidad: 'und', detalle: 'Solo planchado' },
    { id: 'quitamanchas', cat: 'extras', nombre: 'Tratamiento de manchas', tipo: 'unidad', tarifa: 6, unidad: 'und', detalle: 'Por prenda' },
    { id: 'costura', cat: 'extras', nombre: 'Costura / botón', tipo: 'unidad', tarifa: 4, unidad: 'und', detalle: 'Reparación menor' }
  ]
};
