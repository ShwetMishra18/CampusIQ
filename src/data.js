export const buildings = [
  {
    id: 'iet',
    name: 'Institute of Engineering & Technology',
    shortName: 'IET',
    subtitle: 'Faculty of Engineering & Technology',
    floors: [
      { name: 'First Floor', rooms: ['IET17', 'IET18', 'IET19', 'IET20'] },
      { name: 'Second Floor', rooms: ['IET24', 'IET25', 'IET28', 'IET29', 'IET30'] },
      { name: 'Facilities', rooms: ['IET32 Seminar Hall', 'Library', 'CSE Laboratory', 'ME Laboratory', 'ECE Laboratory', 'IT Laboratory'] },
    ],
  },
  {
    id: 'deeksha',
    name: 'Deeksha Bhawan',
    shortName: 'DB',
    subtitle: 'Lecture halls',
    floors: [
      { name: 'Ground Floor', rooms: ['LH01', 'LH02', 'LH03', 'LH04', 'LH05', 'LH06'] },
      { name: 'First Floor', rooms: ['LH07', 'LH08', 'LH09', 'LH10', 'LH11', 'LH12'] },
    ],
  },
]

const roomStatuses = {
  IET17: 'available', IET18: 'occupied', IET19: 'available', IET20: 'reserved',
  IET24: 'available', IET25: 'occupied', IET28: 'available', IET29: 'maintenance', IET30: 'available',
  'IET32 Seminar Hall': 'reserved',
  LH01: 'occupied', LH02: 'available', LH03: 'available', LH04: 'occupied', LH05: 'reserved', LH06: 'available',
  LH07: 'occupied', LH08: 'available', LH09: 'occupied', LH10: 'available', LH11: 'occupied', LH12: 'available',
}

export const rooms = buildings.flatMap((building) => building.floors.flatMap((floor) =>
  floor.rooms.map((name) => ({
    name,
    building: building.id,
    buildingName: building.shortName,
    floor: floor.name,
    status: roomStatuses[name] || 'available',
    capacity: null,
  })),
))

export const statusLabels = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  maintenance: 'Maintenance',
}

export const scheduleItems = [
  { subject: 'Data Structures & Algorithms', faculty: 'Dr. Ananya Singh', room: 'IET18', date: '2026-11-05', time: '09:00 – 10:00', branch: 'CSE · Semester III', color: 'blue' },
  { subject: 'Engineering Mathematics III', faculty: 'Prof. R. K. Verma', room: 'LH04', date: '2026-11-05', time: '10:15 – 11:15', branch: 'ECE · Semester III', color: 'gold' },
  { subject: 'Digital Logic Design', faculty: 'Dr. Meera Srivastava', room: 'IET25', date: '2026-11-05', time: '11:30 – 12:30', branch: 'CSE · Semester V', color: 'green' },
  { subject: 'Open Lab Session', faculty: 'Faculty of IET', room: 'CSE Laboratory', date: '2026-11-05', time: '14:00 – 16:00', branch: 'CSE · Semester V', color: 'purple' },
]

export const announcements = [
  { title: 'Mid-semester assessment schedule', category: 'Examination', date: '05 Nov 2026', status: 'New', tone: 'gold' },
  { title: 'IET18 moved to IET19 for the 10 AM lecture', category: 'Classroom change', date: '05 Nov 2026', status: 'Today', tone: 'blue' },
  { title: 'Updated academic calendar for Semester V', category: 'Academic', date: '04 Nov 2026', status: 'Updated', tone: 'green' },
  { title: 'Faculty meeting · Seminar Hall IET32', category: 'Faculty notice', date: '03 Nov 2026', status: 'Tomorrow', tone: 'purple' },
]

export const sampleBookings = [
  { room: 'IET32 Seminar Hall', purpose: 'Project review session', date: '06 Nov 2026', time: '14:00 – 16:00', status: 'Pending' },
  { room: 'IET19', purpose: 'Extra lecture · CSE III', date: '09 Nov 2026', time: '11:00 – 12:00', status: 'Approved' },
  { room: 'LH08', purpose: 'Faculty mentoring session', date: '10 Nov 2026', time: '13:00 – 14:00', status: 'Approved' },
  { room: 'IET24', purpose: 'CSE project presentation', date: '11 Nov 2026', time: '10:00 – 11:00', status: 'Pending' },
  { room: 'LH02', purpose: 'Peer learning workshop', date: '12 Nov 2026', time: '09:00 – 10:00', status: 'Approved' },
  { room: 'IET28', purpose: 'Design review', date: '12 Nov 2026', time: '14:00 – 15:00', status: 'Pending' },
  { room: 'LH06', purpose: 'Study group', date: '02 Nov 2026', time: '15:00 – 16:00', status: 'Completed' },
]

export const facilities = ['Library', 'CSE Laboratory', 'ME Laboratory', 'ECE Laboratory', 'IT Laboratory']

export const siteSettings = {
  university: 'Deen Dayal Upadhyaya Gorakhpur University',
  institute: 'Institute of Engineering & Technology',
  location: 'Gorakhpur, Uttar Pradesh, India',
  productName: 'CampusIQ',
  tagline: 'Smarter Classrooms. Smarter Campus.',
  academicTerm: 'Semester 5 · 2026–27',
  displayName: 'Aarav Mishra',
  role: 'Faculty · IET',
}
