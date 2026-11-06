const bearer = [{ bearerAuth: [] }]

export const openApiDocument = {
  openapi: '3.0.3',
  info: { title: 'CampusIQ API', version: '2.0.0', description: 'CampusIQ backend API. In demo mode, the JSON store is explicitly separate from PostgreSQL records.' },
  servers: [{ url: '/', description: 'Current CampusIQ host' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: { Error: { type: 'object', properties: { error: { type: 'string' } } }, User: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ['STUDENT', 'FACULTY', 'ADMIN'] } } } }
  },
  paths: {
    '/api/health': { get: { summary: 'API health and storage mode', responses: { 200: { description: 'Service is ready' } } } },
    '/api/auth/register': { post: { summary: 'Register a student account', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 10 } } } } } }, responses: { 201: { description: 'Student account created' }, 409: { description: 'Email already used' } } } },
    '/api/auth/login': { post: { summary: 'Log in as a student, faculty member or administrator', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } }, responses: { 200: { description: 'JWT and current user' }, 401: { description: 'Invalid credentials' } } } },
    '/api/auth/me': { get: { summary: 'Get the current profile', security: bearer, responses: { 200: { description: 'Authenticated profile' } } }, patch: { summary: 'Update the current profile name', security: bearer, responses: { 200: { description: 'Updated profile' } } } },
    '/api/buildings': { get: { summary: 'List active buildings, floors and rooms', security: bearer, responses: { 200: { description: 'Building list' } } } },
    '/api/rooms': { get: { summary: 'Search rooms and time-slot availability', security: bearer, parameters: [{ in: 'query', name: 'building', schema: { type: 'string' } }, { in: 'query', name: 'floor', schema: { type: 'string' } }, { in: 'query', name: 'capacity', schema: { oneOf: [{ type: 'integer' }, { type: 'string', enum: ['unlisted'] }] } }, { in: 'query', name: 'date', schema: { type: 'string', format: 'date' } }, { in: 'query', name: 'timeSlot', schema: { type: 'string' } }], responses: { 200: { description: 'Filtered rooms with live availability' } } } },
    '/api/bookings': { get: { summary: 'List the current user’s or administrator’s bookings', security: bearer, responses: { 200: { description: 'Booking history' } } }, post: { summary: 'Request a classroom booking', security: bearer, responses: { 201: { description: 'Pending booking' }, 409: { description: 'Conflict, with alternative rooms when available' } } } },
    '/api/bookings/{id}/status': { patch: { summary: 'Approve, reject, cancel or complete a booking (admin)', security: bearer, parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated booking' }, 403: { description: 'Admin permission required' } } } },
    '/api/schedule': { get: { summary: 'List academic schedules', security: bearer, responses: { 200: { description: 'Schedule entries scoped to the user' } } }, post: { summary: 'Create a schedule entry (faculty/admin)', security: bearer, responses: { 201: { description: 'Created schedule' } } } },
    '/api/announcements': { get: { summary: 'List published targeted announcements', security: bearer, responses: { 200: { description: 'Announcements' } } } },
    '/api/examinations': { get: { summary: 'List examination notices for the current audience', security: bearer, responses: { 200: { description: 'Examination notices' } } } },
    '/api/notifications': { get: { summary: 'List the current user’s notifications', security: bearer, responses: { 200: { description: 'Notifications' } } } },
    '/api/admin/catalog/{collection}': { put: { summary: 'Save admin catalog section', security: bearer, parameters: [{ in: 'path', name: 'collection', required: true, schema: { type: 'string', enum: ['buildings', 'rooms', 'schedule', 'announcements', 'settings'] } }], responses: { 200: { description: 'Saved catalog section' }, 403: { description: 'Admin permission required' } } } }
  }
}
