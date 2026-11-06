import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, ArrowRight, Bell, BookOpen, Building2,
  CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  DoorOpen, GraduationCap, Landmark, LayoutDashboard, LibraryBig, LogOut, MapPin, Menu,
  Pencil, Search, Settings2, SlidersHorizontal, Sparkles, Trash2, X, UserRound, UsersRound,
  ClipboardList, FileText, PanelsTopLeft, Plus, BookmarkCheck, CheckCircle2, Save, ShieldCheck,
} from 'lucide-react'
import { announcements, buildings, rooms, sampleBookings, scheduleItems, siteSettings, statusLabels } from './data'
import { campusApi } from './api'

const navigation = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, group: 'Workspace' },
  { label: 'Room Availability', to: '/rooms', icon: DoorOpen, group: 'Workspace' },
  { label: 'Classroom Booking', to: '/book', icon: CalendarDays, group: 'Workspace' },
  { label: 'Academic Schedule', to: '/schedule', icon: BookOpen, group: 'Academics' },
  { label: 'Examination Notices', to: '/examinations', icon: FileText, group: 'Academics' },
  { label: 'Announcements', to: '/announcements', icon: Bell, group: 'Academics' },
  { label: 'Campus Buildings', to: '/buildings', icon: Building2, group: 'Campus' },
  { label: 'My Bookings', to: '/bookings', icon: BookmarkCheck, group: 'Campus' },
  { label: 'Administration', to: '/admin', icon: ShieldCheck, group: 'Campus' },
  { label: 'Profile & Settings', to: '/profile', icon: Settings2, group: 'Campus' },
]

const roomTimeSlots = ['Any time', '09:00 – 10:00', '10:00 – 11:00', '11:00 – 12:00', '12:00 – 13:00', '14:00 – 15:00', '15:00 – 16:00']

function todayLabel() {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date())
}

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date())
}

function BrandMark({ compact = false, productName = 'CampusIQ' }) {
  return <div className={`brand-mark ${compact ? 'brand-mark-small' : ''}`} aria-label={`DDUGU ${productName}`}>
    <div className="brand-seal"><Landmark /></div>
    {!compact && <div className="brand-copy"><span>DDUGU · IET</span><strong>{productName}</strong></div>}
  </div>
}

function Sidebar({ collapsed, mobileOpen, onToggle, onClose, apiStatus, settings = siteSettings, announcementData = announcements, authUser }) {
  const groups = [...new Set(navigation.map((item) => item.group))]
  const newAnnouncementCount = announcementData.filter((item) => item.status === 'New' || item.status === 'Today').length
  return <>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <div className="sidebar-brand-row">
        <BrandMark compact={collapsed} productName={settings.productName} />
        <button className="icon-button sidebar-close" aria-label="Close menu" onClick={onClose}><X size={18} /></button>
      </div>
      {!collapsed && <div className="institution-label"><span>{settings.university}</span><strong>{settings.institute}</strong><small>{settings.location}</small></div>}
      <div className="side-divider" />
      <nav className="side-nav" aria-label="Main navigation">
        {groups.map((group) => <div className="nav-group" key={group}>
          {!collapsed && <div className="nav-group-label">{group}</div>}
          {navigation.filter((item) => item.group === group && (item.to !== '/admin' || authUser?.role === 'ADMIN')).map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} title={collapsed ? label : undefined} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={to === '/'}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Announcements' && !collapsed && newAnnouncementCount > 0 && <i className="nav-count">{newAnnouncementCount}</i>}
          </NavLink>)}
        </div>)}
      </nav>
      {!collapsed && <div className="sidebar-bottom">
        <div className="campus-status"><span className={apiStatus === 'online' ? 'live-dot' : 'sample-dot'} /><div><strong>{apiStatus === 'online' ? 'Backend connected' : apiStatus === 'connecting' ? 'Connecting to API' : 'API offline'}</strong><small>{apiStatus === 'online' ? 'Bookings save on this server' : apiStatus === 'connecting' ? 'Checking local server' : 'Run npm run dev:all'}</small></div><Activity size={16} /></div>
        <div className="sidebar-footnote">{settings.tagline}</div>
      </div>}
    </aside>
    {collapsed && <button className="sidebar-expand" aria-label="Expand sidebar" onClick={onToggle}><ChevronRight size={17} /></button>}
  </>
}

function initialsFor(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'CI'
}

function Header({ onMenu, onExpand, collapsed, pageLabel, roomData = rooms, announcementData = announcements, settings = siteSettings, authUser, onSignOut }) {
  const [query, setQuery] = useState('')
  const [openMenu, setOpenMenu] = useState('')
  const navigate = useNavigate()
  const searchInput = useRef(null)
  const [serverNotifications, setServerNotifications] = useState([])
  const roomResults = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return roomData.filter((room) => room.name.toLowerCase().includes(q) || room.buildingName.toLowerCase().includes(q)).slice(0, 4)
  }, [query, roomData])
  const noticeResults = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return announcementData.filter((item) => `${item.title} ${item.category}`.toLowerCase().includes(q)).slice(0, 3)
  }, [query, announcementData])
  useEffect(() => {
    let active = true
    if (!authUser) { setServerNotifications([]); return () => { active = false } }
    campusApi.getNotifications().then((items) => { if (active) setServerNotifications(items) }).catch(() => { if (active) setServerNotifications([]) })
    return () => { active = false }
  }, [authUser])
  const notifications = authUser ? serverNotifications : announcementData.filter((item) => item.status === 'New' || item.status === 'Today').slice(0, 2)

  useEffect(() => {
    function handleSearchShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpenMenu('search')
        searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  function openRoomSearch(value = query) {
    navigate(`/rooms?q=${encodeURIComponent(value.trim())}`)
    setOpenMenu('')
  }

  function openNoticeSearch(value = query) {
    navigate(`/announcements?q=${encodeURIComponent(value.trim())}`)
    setOpenMenu('')
  }

  return <header className="topbar">
    <div className="topbar-left">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMenu}><Menu size={20} /></button>
      <button className="icon-button desktop-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onExpand}><PanelsTopLeft size={19} /></button>
      <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{pageLabel}</strong></div>
    </div>
    <div className="topbar-search-wrap">
      <Search size={17} />
      <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setOpenMenu('search')} placeholder="Search rooms, notices..." aria-label="Search rooms and notices" />
      <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
      {openMenu === 'search' && query && <>
        <button className="menu-dismiss" aria-label="Close search results" onClick={() => setOpenMenu('')} />
        <div className="search-results">
          {roomResults.length > 0 && <><div className="dropdown-caption">ROOMS</div>{roomResults.map((room) => <button key={room.name} onClick={() => openRoomSearch(room.name)}><DoorOpen size={16} /><span>{room.name}<small>{room.buildingName} · {room.floor}</small></span><ArrowRight size={15} /></button>)}</>}
          {noticeResults.length > 0 && <><div className="dropdown-caption">NOTICES</div>{noticeResults.map((notice) => <button key={notice.title} onClick={() => openNoticeSearch(notice.title)}><FileText size={16} /><span>{notice.title}<small>{notice.category} · {notice.date}</small></span><ArrowRight size={15} /></button>)}</>}
          {!roomResults.length && !noticeResults.length && <div className="no-search-results">No rooms or notices match “{query}”</div>}
          {roomResults.length > 0 && <button className="search-all" onClick={() => openRoomSearch()}>Show matching rooms <ArrowRight size={14} /></button>}
          {noticeResults.length > 0 && <button className="search-all" onClick={() => openNoticeSearch()}>Show matching notices <ArrowRight size={14} /></button>}
        </div>
      </>}
    </div>
    <div className="topbar-right">
      <div className="dropdown-anchor">
        <button className={`icon-button notification-button ${openMenu === 'notifications' ? 'is-open' : ''}`} aria-label="Notifications" onClick={() => setOpenMenu(openMenu === 'notifications' ? '' : 'notifications')}><Bell size={19} />{notifications.length > 0 && <i />}</button>
        {openMenu === 'notifications' && <div className="small-dropdown notification-dropdown"><div className="dropdown-head"><strong>Notifications</strong><span>{authUser ? notifications.filter((item) => !item.isRead).length : notifications.length} new</span></div>{notifications.map((item) => <button className="notification-item" key={item.id || item.title} onClick={async () => { if (item.id) { try { await campusApi.markNotificationRead(item.id); setServerNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry)) } catch {} } navigate(item.type?.startsWith('BOOKING') ? '/bookings' : item.type === 'SCHEDULE_CHANGE' ? '/schedule' : '/announcements'); setOpenMenu('') }}><span className={`notice-dot ${item.tone === 'gold' || item.type === 'VENUE_CHANGE' ? 'gold-dot' : 'blue-dot'}`} /><span><strong>{item.title}</strong><small>{item.body || `${item.category || 'Campus update'} · ${item.date || ''}`}</small><time>{item.createdAt ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt)) : item.status}</time></span></button>)}{!notifications.length && <div className="no-search-results">No new notifications.</div>}<button className="dropdown-link" onClick={() => { navigate(authUser ? '/profile' : '/announcements'); setOpenMenu('') }}>{authUser ? 'View notification preferences' : 'View all announcements'} <ArrowRight size={14} /></button></div>}
      </div>
      <div className="topbar-separator" />
      <div className="dropdown-anchor">
        <button className="profile-trigger" onClick={() => setOpenMenu(openMenu === 'profile' ? '' : 'profile')}><span className="avatar">{initialsFor(authUser?.name || settings.displayName)}</span><span className="profile-trigger-copy"><strong>{authUser?.name || 'Sign in'}</strong><small>{authUser?.role || 'Guest'}</small></span><ChevronDown size={15} /></button>
        {openMenu === 'profile' && <div className="small-dropdown profile-dropdown">{authUser ? <><div className="profile-dropdown-head"><span className="avatar avatar-large">{initialsFor(authUser.name)}</span><span><strong>{authUser.name}</strong><small>{authUser.role}</small></span></div><button onClick={() => { navigate('/profile'); setOpenMenu('') }}><UserRound size={16} />Profile & settings</button><button onClick={() => { setOpenMenu(''); onSignOut() }}><LogOut size={16} />Sign out</button></> : <><div className="profile-dropdown-head"><span><strong>Guest session</strong><small>Sign in to request or manage bookings.</small></span></div><button onClick={() => { navigate('/login'); setOpenMenu('') }}><UserRound size={16} />Sign in / register</button></>}</div>}
      </div>
    </div>
  </header>
}

function SectionTitle({ eyebrow, title, subtitle, action, onAction }) {
  return <div className="section-heading"><div>{eyebrow && <div className="section-eyebrow">{eyebrow}</div>}<h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="text-button" onClick={onAction}>{action}<ArrowRight size={15} /></button>}</div>
}

const DataModeContext = createContext(true)

function DemoBadge() { const demoMode = useContext(DataModeContext); return <span className="demo-badge"><span /> {demoMode ? 'Demo data' : 'Live database'}</span> }

function QuickActions({ setRoute }) {
  const actions = [
    { label: 'Find available classroom', detail: 'Search campus spaces', icon: Search, to: '/rooms', tone: 'navy' },
    { label: 'Book a classroom', detail: 'Request a room', icon: CalendarDays, to: '/book', tone: 'gold' },
    { label: 'View academic schedule', detail: 'Classes & activities', icon: BookOpen, to: '/schedule', tone: 'blue' },
    { label: 'Examination notices', detail: 'Dates & updates', icon: FileText, to: '/examinations', tone: 'green' },
  ]
  return <section className="quick-actions-section"><div className="quick-actions-label"><span>QUICK ACTIONS</span><small>Get where you need to go</small></div><div className="quick-action-grid">{actions.map(({ label, detail, icon: Icon, to, tone }) => <button className="quick-action" key={to} onClick={() => setRoute(to)}><span className={`quick-action-icon quick-${tone}`}><Icon size={17} /></span><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight size={14} className="quick-action-arrow" /></button>)}</div></section>
}

function StatCard({ icon: Icon, label, value, change, accent, onClick }) {
  return <button className={`stat-card stat-${accent}`} onClick={onClick}>
    <div className="stat-top"><span className="stat-icon"><Icon size={19} strokeWidth={1.8} /></span><span className="stat-context">{change}</span></div>
    <div className="stat-value">{value}</div><div className="stat-label">{label}</div>
    <span className="stat-link">View details <ArrowRight size={13} /></span>
  </button>
}

function StatusPill({ status }) { return <span className={`status-pill status-${status}`}><i />{statusLabels[status] || status}</span> }

function RoomLine({ room, onClick }) {
  return <button className="room-line" onClick={onClick}><span className={`room-symbol room-${room.status}`}><DoorOpen size={16} /></span><span className="room-line-name"><strong>{room.name}</strong><small>{room.buildingName} · {room.floor}</small></span><StatusPill status={room.status} /><ChevronRight size={15} className="room-arrow" /></button>
}

function TodaySchedule({ compact = false, items = scheduleItems }) {
  return <div className={`schedule-list ${compact ? 'schedule-list-compact' : ''}`}>
    {items.slice(0, compact ? 4 : 3).map((item) => <div className="schedule-item" key={item.subject}>
      <div className="schedule-time">{item.time.split(' – ')[0]}<span>{item.time.split(' – ')[1]}</span></div>
      <span className={`schedule-track track-${item.color}`} />
      <div className="schedule-detail"><strong>{item.subject}</strong><span><UserRound size={13} />{item.faculty}</span><div className="schedule-meta"><span><MapPin size={12} />{item.room}</span><span>{item.branch}</span></div></div>
    </div>)}
  </div>
}

function AnnouncementList({ items = announcements, onOpen }) {
  return <div className="announcement-list">{items.map((item) => {
    const content = <><span className={`announcement-icon tone-${item.tone}`}><FileText size={16} /></span><span className="announcement-copy"><strong>{item.title}</strong><span><i className={`category-dot tone-${item.tone}`} />{item.category}<b>·</b>{item.date}</span></span><span className={`announcement-status badge-${item.tone}`}>{item.status}</span>{onOpen && <ChevronRight size={15} className="announcement-arrow" />}</>
    return onOpen
      ? <button className="announcement-row" key={item.title} onClick={() => onOpen(item)}>{content}</button>
      : <div className="announcement-row announcement-row-static" key={item.title}>{content}</div>
  })}</div>
}

function Dashboard({ onBooking, setRoute, setSelectedRoom, roomData = rooms, buildingData = buildings, scheduleData = scheduleItems, announcementData = announcements, bookingsData = sampleBookings, settings = siteSettings }) {
  const isDemo = useContext(DataModeContext)
  const [building, setBuilding] = useState(buildingData[0]?.id || 'iet')
  const [floor, setFloor] = useState('All floors')
  useEffect(() => {
    if (!buildingData.some((item) => item.id === building)) {
      setBuilding(buildingData[0]?.id || '')
      setFloor('All floors')
    }
  }, [buildingData, building])
  const currentBuilding = buildingData.find((item) => item.id === building)
  const floors = ['All floors', ...(currentBuilding?.floors.map((item) => item.name) || [])]
  const visibleRooms = roomData.filter((room) => room.building === building && (floor === 'All floors' || room.floor === floor)).slice(0, 5)
  const classroomRooms = roomData.filter((room) => room.name !== 'Library' && !room.name.includes('Laboratory'))
  const upcomingBookings = bookingsData.filter((booking) => ['Pending', 'Approved'].includes(booking.status) && (!booking.dateISO || booking.dateISO >= todayISO())).length
  const todaysSchedule = scheduleData.filter((item) => !item.date || item.date === todayISO())
  return <div className="page-content dashboard-page">
    <div className="welcome-banner">
      <div className="welcome-copy"><div className="welcome-meta"><span className="gold-dash" />{todayLabel()}<span className="welcome-separator">/</span><span>{settings.academicTerm}</span></div><h1>Welcome to <em>{settings.productName}</em></h1><p>{settings.tagline} Here’s your campus at a glance.</p><div className="welcome-actions"><button className="button-primary" onClick={() => setRoute('/rooms')}><Search size={16} />Find a classroom</button><button className="button-quiet" onClick={onBooking}><Plus size={16} />Request a booking</button></div></div>
      <div className="welcome-art" aria-hidden="true"><div className="art-arch"><div className="art-sun" /><div className="art-building"><span /><span /><span /><i /></div></div><div className="art-label"><span>DDUGU</span><strong>IET · GORAKHPUR</strong></div></div>
      <span className="welcome-ornament ornament-one" /><span className="welcome-ornament ornament-two" />
    </div>
    <div className="stats-heading"><div><h2>Today at a glance</h2><span>Campus overview · DDUGU IET</span></div><DemoBadge /></div>
    <div className="stats-grid">
      <StatCard icon={PanelsTopLeft} label="Total classrooms" value={classroomRooms.length} change={`Across ${buildingData.length} buildings`} accent="navy" onClick={() => setRoute('/buildings')} />
      <StatCard icon={DoorOpen} label="Available rooms" value={classroomRooms.filter((room) => room.status === 'available').length} change="Ready to use" accent="green" onClick={() => setRoute('/rooms')} />
      <StatCard icon={UsersRound} label="Occupied rooms" value={String(classroomRooms.filter((room) => room.status === 'occupied').length).padStart(2, '0')} change={isDemo ? "Sample room status" : "Live room status"} accent="blue" onClick={() => setRoute('/rooms')} />
      <StatCard icon={CalendarDays} label="Upcoming bookings" value={String(upcomingBookings).padStart(2, '0')} change="Pending or approved" accent="gold" onClick={() => setRoute('/bookings')} />
    </div>
    <QuickActions setRoute={setRoute} />
    <div className="dashboard-grid dashboard-grid-top">
      <section className="panel room-panel">
        <SectionTitle eyebrow="FIND YOUR SPACE" title="Room availability" subtitle="Check classroom status across campus." action="View all rooms" onAction={() => setRoute('/rooms')} />
        <div className="room-filter-row"><div className="segmented-control" role="group" aria-label="Choose building">{buildingData.map((item) => <button key={item.id} className={building === item.id ? 'selected' : ''} onClick={() => { setBuilding(item.id); setFloor('All floors') }}>{item.shortName}</button>)}</div><label className="select-with-icon"><SlidersHorizontal size={14} /><select aria-label="Filter by floor" value={floor} onChange={(event) => setFloor(event.target.value)}>{floors.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label></div>
        <div className="room-list">{visibleRooms.map((room) => <RoomLine room={room} key={room.name} onClick={() => { setSelectedRoom(room); setRoute('/rooms') }} />)}</div>
        <div className="status-legend"><span><i className="legend-green" />Available</span><span><i className="legend-red" />Occupied</span><span><i className="legend-orange" />Reserved</span><span><i className="legend-grey" />Maintenance</span></div>
      </section>
      <section className="panel schedule-panel">
        <div className="schedule-panel-head"><SectionTitle eyebrow={todayShortLabel()} title="Your schedule" /><button className="round-arrow" aria-label="View full schedule" onClick={() => setRoute('/schedule')}><ArrowRight size={16} /></button></div>
        <div className="schedule-summary"><span className="summary-icon"><CalendarDays size={16} /></span><span><strong>{todaysSchedule.length} activities</strong><small>{isDemo ? "Sample timetable" : "Academic timetable"} · IET</small></span><span className="summary-day">TODAY</span></div>
        <TodaySchedule items={todaysSchedule} />
        <button className="schedule-footer" onClick={() => setRoute('/schedule')}>Open academic schedule <ArrowRight size={14} /></button>
      </section>
    </div>
    <div className="dashboard-grid dashboard-grid-bottom">
      <section className="panel announcements-panel"><div className="panel-heading-inline"><SectionTitle eyebrow="FROM THE UNIVERSITY" title="Latest announcements" subtitle="The latest updates for your campus." action="All announcements" onAction={() => setRoute('/announcements')} /><span className="announcement-count">{announcementData.filter((item) => item.status === 'New' || item.status === 'Today').length.toString().padStart(2, '0')} <small>NEW</small></span></div><AnnouncementList items={announcementData.slice(0, 3)} onOpen={() => setRoute('/announcements')} /></section>
      <section className="panel campus-panel"><SectionTitle eyebrow="EXPLORE YOUR CAMPUS" title="Campus buildings" subtitle="Choose a building to browse its spaces." />
        <div className="building-cards">{buildingData.map((item, index) => <button className={`building-card building-card-${index}`} key={item.id} onClick={() => { setRoute('/buildings'); setSelectedRoom(null) }}><span className="building-illustration"><Building2 size={25} /><span /><span /><span /></span><span className="building-info"><strong>{item.name}</strong><small>{roomData.filter((room) => room.building === item.id).length} listed spaces</small></span><ArrowRight size={16} className="building-link" /></button>)}</div>
        <div className="campus-location"><MapPin size={15} /><span>{settings.location}</span><span className="campus-location-separator" /> <span>{settings.university}</span></div>
      </section>
    </div>
    <footer className="page-footer"><span>{settings.productName} · {settings.tagline}</span><span>Built for {settings.university} · {settings.institute}</span></footer>
  </div>
}

function PageHeader({ eyebrow, title, subtitle, children }) {
  return <div className="subpage-header"><div><div className="section-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="subpage-actions">{children}</div></div>
}

function todayShortLabel() {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
    .format(new Date()).replace(',', ' ·').toUpperCase()
}

function RoomsPage({ selectedRoom, setSelectedRoom, roomData = rooms, buildingData = buildings, scheduleData = scheduleItems }) {
  const isDemo = useContext(DataModeContext)
  const location = useLocation()
  const [building, setBuilding] = useState('all')
  const [floor, setFloor] = useState('all')
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') || '')
  const [status, setStatus] = useState('all')
  const [timeSlot, setTimeSlot] = useState('Any time')
  const [date, setDate] = useState(todayISO())
  const [capacity, setCapacity] = useState('any')
  const [apiRooms, setApiRooms] = useState(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const floors = building === 'all' ? [...new Set(roomData.map((room) => room.floor))] : [...new Set(roomData.filter((room) => room.building === building).map((room) => room.floor))]
  const selectedInterval = timeSlot === 'Any time' ? null : timeSlot.split(' – ').map((time) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes })
  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get('q') || '')
  }, [location.search])
  useEffect(() => {
    let active = true
    setAvailabilityLoading(true)
    campusApi.getRooms({ building, floor, capacity: capacity === 'unlisted' ? 'unlisted' : '', q: query, date, timeSlot, status })
      .then((result) => { if (active) setApiRooms(result) })
      .catch(() => { if (active) setApiRooms(null) })
      .finally(() => { if (active) setAvailabilityLoading(false) })
    return () => { active = false }
  }, [building, floor, capacity, query, date, timeSlot, status])
  const slotRooms = roomData.map((room) => {
    if (!selectedInterval) return room
    const statusForSlot = room.status === 'maintenance' || room.status === 'reserved' ? room.status : 'available'
    const scheduled = scheduleData.some((item) => {
      if (item.room !== room.name || (item.date && item.date !== date)) return false
      const [startText, endText] = item.time.split(' – ')
      const toMinutes = (value) => { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes }
      return selectedInterval[0] < toMinutes(endText) && toMinutes(startText) < selectedInterval[1]
    })
    return { ...room, status: scheduled ? 'occupied' : statusForSlot }
  })
  const localFilteredRooms = slotRooms.filter((room) => (building === 'all' || room.building === building) && (floor === 'all' || room.floor === floor) && (status === 'all' || room.status === status) && (!query || room.name.toLowerCase().includes(query.toLowerCase())) && (capacity === 'any' || room.capacity === null))
  const filteredRooms = apiRooms ?? localFilteredRooms
  const availabilityNote = isDemo
    ? timeSlot === 'Any time' ? `Demo room status for ${date === todayISO() ? 'today' : date}` : `Demo availability · ${timeSlot}`
    : timeSlot === 'Any time' ? `Live room status · ${date}` : `Live availability · ${timeSlot}`
  return <div className="page-content subpage-content">
    <PageHeader eyebrow="CAMPUS SPACES" title="Room availability" subtitle="Find an available classroom or check a room’s current status."><DemoBadge /></PageHeader>
    <section className="panel filters-panel"><div className="filter-heading"><div><strong>Filter rooms</strong><small>Choose a building, time and other details.</small></div><button className="clear-filters" onClick={() => { setBuilding('all'); setFloor('all'); setQuery(''); setStatus('all'); setTimeSlot('Any time'); setDate(todayISO()); setCapacity('any') }}>Clear filters</button></div>
      <div className="filter-grid">
        <label className="field-label">Building<select value={building} onChange={(event) => { setBuilding(event.target.value); setFloor('all') }}><option value="all">All buildings</option>{buildingData.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field-label">Floor<select value={floor} onChange={(event) => setFloor(event.target.value)}><option value="all">All floors</option>{floors.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field-label">Classroom<div className="field-search"><Search size={15} /><input placeholder="Search by room name" value={query} onChange={(event) => setQuery(event.target.value)} /></div></label>
        <label className="field-label">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="field-label">Time slot<select value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)}>{roomTimeSlots.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field-label">Capacity<select value={capacity} onChange={(event) => setCapacity(event.target.value)}><option value="any">Any capacity</option><option value="unlisted">Capacity not listed</option></select></label>
      </div>
      <div className="filter-status"><span>Status</span>{['all', 'available', 'occupied', 'reserved', 'maintenance'].map((item) => <button key={item} className={`filter-chip ${status === item ? 'chosen' : ''}`} onClick={() => setStatus(item)}>{item === 'all' ? 'All rooms' : statusLabels[item]}</button>)}<span className="slot-summary"><Clock3 size={14} />{availabilityNote}</span></div>
    </section>
    {selectedRoom && <div className="selected-room-note"><span className={`room-symbol room-${selectedRoom.status}`}><DoorOpen size={16} /></span><span><strong>{selectedRoom.name}</strong><small>{selectedRoom.buildingName} · {selectedRoom.floor} · {selectedRoom.capacity ? `Capacity ${selectedRoom.capacity}` : "Capacity not listed"}</small></span><StatusPill status={selectedRoom.status} /><button className="icon-button" aria-label="Dismiss selected room" onClick={() => setSelectedRoom(null)}><X size={17} /></button></div>}
    <div className="room-results-head"><div><strong>{filteredRooms.length} spaces</strong><span> across {building === 'all' ? 'both buildings' : buildingData.find((item) => item.id === building)?.shortName}</span></div><span className="results-updated">{availabilityLoading ? <Activity size={13} /> : <span className={apiRooms ? 'live-dot' : 'sample-dot'} />}{isDemo ? 'Demo availability' : 'Live availability'}</span></div>
    <div className="room-card-grid">{filteredRooms.map((room) => <button className="room-card" key={room.name} onClick={() => setSelectedRoom(room)}><div className="room-card-top"><span className={`room-symbol room-${room.status}`}><DoorOpen size={17} /></span><StatusPill status={room.status} /></div><strong>{room.name}</strong><span className="room-card-building"><Building2 size={14} />{room.buildingName} · {room.floor}</span><span className="room-card-capacity">{room.capacity ? `Capacity ${room.capacity}` : "Capacity not listed"}</span></button>)}{!filteredRooms.length && <div className="empty-state room-empty-state"><DoorOpen size={25} /><strong>No spaces match these filters</strong><span>{isDemo ? 'Clear or change your filters to see demo campus spaces.' : 'Clear or change your filters to see matching campus spaces.'}</span><button className="button-quiet" onClick={() => { setBuilding('all'); setFloor('all'); setQuery(''); setStatus('all'); setTimeSlot('Any time'); setDate(todayISO()); setCapacity('any') }}>Clear filters</button></div>}</div>
    <p className="data-note"><CircleHelp size={15} />{apiRooms !== null ? "Room availability is checked against the database. Only recorded capacities are shown." : "Room availability and schedules are sample data. Capacity figures have not been provided."}</p>
  </div>
}

function BookingPage({ setBookings, roomData = rooms, buildingData = buildings, authUser }) {
  const navigate = useNavigate()
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alternatives, setAlternatives] = useState([])
  const [room, setRoom] = useState('')
  const [building, setBuilding] = useState('')
  async function handleSubmit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSubmitError('')
    setAlternatives([])
    setSubmitting(true)
    try {
      const booking = await campusApi.createBooking({
        building,
        room,
        date: form.get('date'),
        time: form.get('time'),
        purpose: form.get('purpose'),
        purposeType: form.get('purposeType'),
        notes: form.get('notes'),
      })
      setBookings((current) => [booking, ...current])
      setSubmitted(true)
      formElement.reset()
      setRoom('')
      setBuilding('')
    } catch (error) {
      setSubmitError(error.message)
      setAlternatives(error.alternatives || [])
    } finally { setSubmitting(false) }
  }
  if (!authUser || !['FACULTY', 'ADMIN'].includes(authUser.role)) return <div className="page-content subpage-content"><PageHeader eyebrow="ROOM REQUESTS" title="Book a classroom" subtitle="Faculty sign-in is required to request a room."><DemoBadge /></PageHeader><section className="panel empty-state"><CalendarDays size={25} /><strong>{authUser ? 'Faculty access required' : 'Sign in to request a booking'}</strong><span>Students can view room availability. Faculty and administrators can submit requests.</span><button className="button-primary" onClick={() => navigate(authUser ? '/' : '/login')}>{authUser ? 'Return to dashboard' : 'Sign in'}</button></section></div>
  return <div className="page-content subpage-content"><PageHeader eyebrow="ROOM REQUESTS" title="Book a classroom" subtitle="Submit a room request for an academic activity."><DemoBadge /></PageHeader>
    <div className="booking-layout"><section className="panel booking-form-panel"><div className="form-panel-title"><span className="form-title-icon"><CalendarDays size={20} /></span><div><h2>Booking details</h2><p>Requests are saved by the CampusIQ server.</p></div></div>{submitted && <div className="success-callout"><CheckCircle2 size={18} /><span><strong>Request submitted</strong><small>Your booking is now in My Bookings.</small></span><button className="icon-button" onClick={() => setSubmitted(false)} aria-label="Dismiss confirmation"><X size={16} /></button></div>}{submitError && <div className="error-callout"><CircleHelp size={18} /><span><strong>Booking not saved</strong><small>{submitError}</small></span><button className="icon-button" onClick={() => { setSubmitError(''); setAlternatives([]) }} aria-label="Dismiss error"><X size={16} /></button></div>}{alternatives.length > 0 && <div className="alternative-rooms"><strong>Available rooms to try</strong>{alternatives.map((item) => <button type="button" key={item.id} onClick={() => { setRoom(item.name); setSubmitError(''); setAlternatives([]) }}><DoorOpen size={15} />{item.name}<span>{item.capacity ? `Capacity ${item.capacity}` : 'Capacity not listed'}</span></button>)}</div>}
      <form className="booking-form" onSubmit={handleSubmit}><label className="field-label">Building<select required value={building} onChange={(event) => { setBuilding(event.target.value); setRoom('') }}><option value="" disabled>Select building</option>{buildingData.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field-label">Preferred classroom<select required value={room} onChange={(event) => setRoom(event.target.value)}><option value="">Select a classroom</option>{roomData.filter((item) => !building || item.building === building).map((item) => <option key={item.name} value={item.name}>{item.name} · {item.buildingName}</option>)}</select></label><label className="field-label">Date<input required name="date" type="date" min={todayISO()} /></label><label className="field-label">Booking type<select required name="purposeType" defaultValue="lecture"><option value="lecture">Extra lecture</option><option value="practical">Practical</option><option value="examination">Minor examination</option><option value="event">Event</option></select></label><label className="field-label">Time slot<select required name="time" defaultValue=""><option value="" disabled>Select a time</option>{roomTimeSlots.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label field-full">Purpose of booking<input required name="purpose" placeholder="e.g. Extra lecture, project review" /></label><label className="field-label field-full">Additional notes <span className="optional-label">Optional</span><textarea name="notes" placeholder="Share any setup or equipment requirements" rows="3" /></label><div className="form-footnote"><CircleHelp size={15} />Room capacities are shown only when recorded.</div><button className="button-primary form-submit" type="submit" disabled={submitting}><SendIcon />{submitting ? 'Submitting…' : 'Submit booking request'}<ArrowRight size={15} /></button></form>
    </section><aside className="panel booking-help"><span className="help-icon"><Sparkles size={19} /></span><div className="section-eyebrow">HOW IT WORKS</div><h2>Plan your next session</h2><p>Choose a building and available time slot. Your request will appear in My Bookings with a pending status.</p><div className="booking-steps"><div><span>01</span><p><strong>Choose a space</strong><small>Browse rooms across IET and Deeksha Bhawan.</small></p></div><div><span>02</span><p><strong>Share the details</strong><small>Add your preferred date, time and purpose.</small></p></div><div><span>03</span><p><strong>Track your request</strong><small>View its status in your booking history.</small></p></div></div><button className="text-button" onClick={() => navigate('/bookings')}>View my bookings <ArrowRight size={14} /></button></aside></div>
  </div>
}

function SendIcon() { return <Plus size={16} /> }

function SchedulePage({ scheduleData = scheduleItems, settings = siteSettings }) {
  const isDemo = useContext(DataModeContext)
  const [date, setDate] = useState(todayISO())
  const [branch, setBranch] = useState('all')
  const [semester, setSemester] = useState('all')
  const selectedDate = new Date(`${date}T12:00:00+05:30`)
  const visibleSchedule = scheduleData.filter((item) => !item.date || item.date === date)
  const branchName = (item) => item.branch.split(' · ')[0].trim()
  const semesterName = (item) => item.branch.match(/Semester\s+[^·]+/i)?.[0].trim() || ''
  const branchOptions = [...new Set(scheduleData.map(branchName))].filter(Boolean)
  const semesterOptions = [...new Set(scheduleData.map(semesterName))].filter(Boolean)
  const filteredSchedule = visibleSchedule.filter((item) =>
    (branch === 'all' || branchName(item) === branch) &&
    (semester === 'all' || semesterName(item) === semester),
  )
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(selectedDate)
  function shiftDate(amount) {
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + amount)
    setDate(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Kolkata' }).format(next))
  }
  return <div className="page-content subpage-content"><PageHeader eyebrow="ACADEMIC PLANNER" title="Academic schedule" subtitle={isDemo ? "A demo timetable for classes and campus activities." : "Academic classes and campus activities."}><DemoBadge /></PageHeader>
    <section className="panel timetable-panel"><div className="timetable-toolbar"><div className="date-navigator"><button className="icon-button" aria-label="Previous day" onClick={() => shiftDate(-1)}><ChevronLeft size={17} /></button><span><strong>{dateLabel}</strong><small>{settings.academicTerm}</small></span><button className="icon-button" aria-label="Next day" onClick={() => shiftDate(1)}><ChevronRight size={17} /></button></div><div className="timetable-filters"><label className="field-label">Branch<select value={branch} onChange={(event) => setBranch(event.target.value)}><option value="all">All branches</option>{branchOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">Semester<select value={semester} onChange={(event) => setSemester(event.target.value)}><option value="all">All semesters</option>{semesterOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div></div><div className="timetable-table-wrap"><table className="timetable-table"><thead><tr><th>TIME</th><th>SUBJECT / ACTIVITY</th><th>FACULTY</th><th>CLASSROOM</th><th>BRANCH / SECTION</th></tr></thead><tbody>{filteredSchedule.map((item) => <tr key={`${item.date}-${item.subject}-${item.room}-${item.time}`}><td><span className="table-time">{item.time.split(' – ')[0]}</span><small>{item.time.split(' – ')[1]}</small></td><td><span className={`table-track track-${item.color}`} /><strong>{item.subject}</strong></td><td>{item.faculty}</td><td><span className="room-table-tag"><MapPin size={13} />{item.room}</span></td><td>{item.branch}</td></tr>)}</tbody></table>{!filteredSchedule.length && <div className="empty-state"><CalendarDays size={25} /><strong>No schedule entries match these filters</strong><span>Choose another date, branch, or semester.</span></div>}</div>{isDemo && <div className="timetable-note"><CircleHelp size={15} />Faculty names, subjects and times shown here are illustrative demo data.</div>}</section>
  </div>
}

function AnnouncementsPage({ examsOnly = false, announcementData = announcements }) {
  const isDemo = useContext(DataModeContext)
  const location = useLocation()
  const list = examsOnly ? announcementData.filter((item) => item.category === 'Examination') : announcementData
  const [category, setCategory] = useState('All categories')
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') || '')
  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get('q') || '')
  }, [location.search])
  const filtered = list.filter((item) =>
    (category === 'All categories' || item.category === category) &&
    (!query || `${item.title} ${item.category}`.toLowerCase().includes(query.toLowerCase())),
  )
  return <div className="page-content subpage-content"><PageHeader eyebrow={examsOnly ? 'EXAM CELL' : 'CAMPUS BULLETIN'} title={examsOnly ? 'Examination notices' : 'Announcements'} subtitle={examsOnly ? 'Important examination dates and academic assessment updates.' : 'University notices, classroom changes and academic updates.'}><DemoBadge /></PageHeader>
    <section className="panel notice-board"><div className="notice-toolbar"><div className="notice-toolbar-label"><span className="notice-board-icon"><ClipboardList size={18} /></span><div><strong>{examsOnly ? 'Exam notice board' : 'University notice board'}</strong><small>{filtered.length} notices · Latest first</small></div></div><label className="field-label notice-category">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="All categories">All categories</option>{[...new Set(list.map((item) => item.category))].map((item) => <option key={item}>{item}</option>)}</select></label></div><AnnouncementList items={filtered} />{!filtered.length && <div className="empty-state"><FileText size={25} /><strong>No notices match this search or category</strong><span>{isDemo ? 'Change the search or category to view demo notices.' : 'Change the search or category to view matching notices.'}</span></div>}{isDemo && <div className="notice-disclaimer"><CircleHelp size={15} />These notices are illustrative demo content and are not official university communications.</div>}</section>
  </div>
}

function BuildingsPage({ selectedRoom, setSelectedRoom, roomData = rooms, buildingData = buildings, settings = siteSettings }) {
  const [building, setBuilding] = useState(buildingData[0]?.id || 'iet')
  const [floor, setFloor] = useState('')
  useEffect(() => {
    if (!buildingData.some((item) => item.id === building)) {
      setBuilding(buildingData[0]?.id || '')
      setFloor('')
    }
  }, [buildingData, building])
  const current = buildingData.find((item) => item.id === building)
  const activeFloor = floor && current?.floors.some((item) => item.name === floor) ? floor : current?.floors[0]?.name || ''
  const currentRooms = roomData.filter((room) => room.building === building && room.floor === activeFloor)
  const isFacilities = activeFloor === 'Facilities'
  const buildingSpaceCount = roomData.filter((room) => room.building === building).length
  const seminarRoom = currentRooms.find((room) => room.name.toLowerCase().includes('seminar hall'))
  const facilityRooms = currentRooms.filter((room) => room !== seminarRoom)
  if (!current) return <div className="page-content subpage-content"><PageHeader eyebrow="CAMPUS MAP" title="Campus buildings" subtitle="Explore campus spaces."><DemoBadge /></PageHeader><section className="panel empty-state"><Building2 size={25} /><strong>No buildings have been added</strong><span>Add a building in the Admin section.</span></section></div>
  return <div className="page-content subpage-content"><PageHeader eyebrow="CAMPUS MAP" title="Campus buildings" subtitle={`Explore the spaces at ${settings.institute}.`}><DemoBadge /></PageHeader>
    <div className="building-selector">{buildingData.map((item, index) => <button className={`building-selector-card building-selector-card-${index % 2}`} key={item.id} onClick={() => { setBuilding(item.id); setFloor('') }}><span className={`selector-art selector-art-${index % 2}`}><Building2 size={30} /></span><span><small>BUILDING {String(index + 1).padStart(2, '0')}</small><strong>{item.name}</strong><em>{roomData.filter((room) => room.building === item.id).length} listed spaces</em></span><span className="selector-check">{building === item.id && <Check size={15} />}</span></button>)}</div>
    <section className="panel building-detail-panel"><div className="building-detail-head"><div className="building-detail-mark"><Building2 size={21} /></div><div><div className="section-eyebrow">{current.shortName} · {settings.location}</div><h2>{current.name}</h2><p>{current.subtitle} · {settings.location}</p></div><span className="building-detail-count">{buildingSpaceCount} listed spaces</span></div><div className="floor-tabs">{current.floors.map((item) => <button className={activeFloor === item.name ? 'selected' : ''} key={item.name} onClick={() => setFloor(item.name)}>{item.name}<span>{roomData.filter((room) => room.building === building && room.floor === item.name).length}</span></button>)}</div>
      {isFacilities ? <>{currentRooms.length ? <><div className="facility-grid">{facilityRooms.map((room) => <button className="facility-card" key={room.name} onClick={() => setSelectedRoom(room)}><span className="facility-icon"><LibraryBig size={18} /></span><span><strong>{room.name}</strong><small>{room.buildingName || current.shortName} · {room.floor}</small></span><ArrowRight size={15} /></button>)}</div>{seminarRoom && <button className="facility-card seminar-card" onClick={() => setSelectedRoom(seminarRoom)}><span className="facility-icon"><PanelsTopLeft size={18} /></span><span><strong>{seminarRoom.name}</strong><small>{seminarRoom.buildingName || current.shortName} · {seminarRoom.floor}</small></span><ArrowRight size={15} /></button>}</> : <div className="empty-state"><LibraryBig size={25} /><strong>No spaces are listed for this area</strong><span>Add spaces in the Admin section.</span></div>}</> : <>{currentRooms.length ? <><div className="space-grid">{currentRooms.map((room) => <button className={`space-tile space-${room.status}`} key={room.name} onClick={() => setSelectedRoom(room)}><span className="space-tile-top"><DoorOpen size={17} /><StatusPill status={room.status} /></span><strong>{room.name}</strong><small>{room.capacity ? `Capacity ${room.capacity}` : 'Capacity not listed'}</small></button>)}</div><div className="status-legend floor-legend"><span><i className="legend-green" />Available</span><span><i className="legend-red" />Occupied</span><span><i className="legend-orange" />Reserved</span><span><i className="legend-grey" />Maintenance</span></div></> : <div className="empty-state"><DoorOpen size={25} /><strong>No spaces are listed on this floor</strong><span>Add spaces in the Admin section.</span></div>}</>}
    </section>{selectedRoom && <div className="selected-room-note"><span className={`room-symbol room-${selectedRoom.status || 'available'}`}><DoorOpen size={16} /></span><span><strong>{selectedRoom.name}</strong><small>{selectedRoom.buildingName || 'IET'} · {selectedRoom.floor} · {selectedRoom.capacity ? `Capacity ${selectedRoom.capacity}` : 'Capacity not listed'}</small></span>{selectedRoom.status && <StatusPill status={selectedRoom.status} />}<button className="icon-button" aria-label="Dismiss selected space" onClick={() => setSelectedRoom(null)}><X size={17} /></button></div>}
  </div>
}

function isDemoBooking(booking) {
  return booking.id?.startsWith('demo-') || booking.createdAt == null
}

function BookingsPage({ bookings, onBook }) {
  const isDemo = useContext(DataModeContext)
  return <div className="page-content subpage-content"><PageHeader eyebrow="MY CAMPUS" title="My bookings" subtitle="Review and track your classroom requests."><button className="button-primary" onClick={onBook}><Plus size={16} />New booking</button></PageHeader>
    <section className="panel bookings-panel"><div className="booking-summary-row"><div><span className="booking-summary-value">{bookings.filter((item) => item.status === 'Pending').length}</span><span><strong>Awaiting review</strong><small>Pending requests</small></span></div><div><span className="booking-summary-value green-value">{bookings.filter((item) => item.status === 'Approved').length}</span><span><strong>Confirmed</strong><small>Approved bookings</small></span></div><div><span className="booking-summary-value muted-value">{bookings.filter((item) => item.status === 'Completed').length}</span><span><strong>Past activity</strong><small>Completed bookings</small></span></div></div><div className="bookings-list-head"><strong>Booking history</strong><span>{bookings.length} requests</span></div><div className="bookings-list">{bookings.map((item, index) => <div className="booking-row" key={item.id || `${item.room}-${item.date}-${index}`}><span className="booking-row-icon"><CalendarDays size={17} /></span><div className="booking-row-main"><strong>{item.purpose}{isDemoBooking(item) && <small className="booking-demo-label">Demo</small>}</strong><span><DoorOpen size={13} />{item.room}<b>·</b><CalendarDays size={13} />{item.date}<b>·</b><Clock3 size={13} />{item.time}</span></div><span className={`booking-status booking-${item.status.toLowerCase()}`}><i />{item.status}</span><ChevronRight size={16} className="booking-row-arrow" /></div>)}</div><p className="data-note"><CircleHelp size={15} />{isDemo ? 'Requests labeled Demo are sample bookings. New requests are saved by the demo server.' : 'Bookings shown here are saved in the campus database.'}</p></section>
  </div>
}

function LoginPage({ onAuthenticated }) {
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event) {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      const result = register ? await campusApi.register({ email, password, name }) : await campusApi.login({ email, password })
      await onAuthenticated(result.user)
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }
  return <div className="page-content subpage-content"><PageHeader eyebrow="CAMPUSIQ ACCOUNT" title={register ? 'Create student account' : 'Sign in'} subtitle="Use your CampusIQ account to access role-specific features." /><section className="panel login-panel"><div className="form-panel-title"><span className="form-title-icon"><ShieldCheck size={20} /></span><div><h2>{register ? 'Student registration' : 'Account access'}</h2><p>JWT-protected campus services</p></div></div>{error && <div className="error-callout"><CircleHelp size={18} /><span><strong>Could not sign in</strong><small>{error}</small></span></div>}<form className="booking-form" onSubmit={submit}>{register && <label className="field-label field-full">Full name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={140} /></label>}<label className="field-label field-full">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></label><label className="field-label field-full">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={register ? 10 : 1} autoComplete={register ? 'new-password' : 'current-password'} /></label><button className="button-primary form-submit" disabled={loading}>{loading ? 'Please wait…' : register ? 'Create student account' : 'Sign in'}<ArrowRight size={15} /></button></form><button className="text-button login-toggle" onClick={() => { setRegister(!register); setError('') }}>{register ? 'Already registered? Sign in' : 'New student? Create an account'}<ArrowRight size={14} /></button><p className="data-note"><CircleHelp size={15} />Demo-only users are provided by the README when the API runs without PostgreSQL.</p></section></div>
}

function ProfilePage({ settings = siteSettings, authUser, onProfileUpdated }) {
  const [saved, setSaved] = useState(false)
  const [profileName, setProfileName] = useState(authUser?.name || '')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [emailUpdates, setEmailUpdates] = useState(true)
  const [bookingUpdates, setBookingUpdates] = useState(true)
  useEffect(() => { setProfileName(authUser?.name || '') }, [authUser?.name])
  const displayName = authUser?.name || settings.displayName
  const role = authUser?.role || settings.role
  async function saveProfile(event) { event.preventDefault(); setProfileError(''); setProfileMessage(''); try { const user = await campusApi.updateProfile({ name: profileName }); onProfileUpdated?.(user); setProfileMessage('Profile updated.') } catch (error) { setProfileError(error.message) } }
  return <div className="page-content subpage-content"><PageHeader eyebrow="ACCOUNT" title="Profile & settings" subtitle="Manage your CampusIQ preferences."><DemoBadge /></PageHeader><div className="profile-layout"><section className="panel profile-card"><div className="profile-cover"><span className="profile-avatar-xl">{initialsFor(displayName)}</span></div><div className="profile-info"><h2>{displayName}</h2><p>{role} · {authUser?.branch || settings.institute}</p><div className="profile-info-line"><span><GraduationCap size={15} />{settings.university}</span><span><MapPin size={15} />{settings.location}</span></div></div>{authUser && <form className="profile-edit-form" onSubmit={saveProfile}>{profileError && <div className="error-callout"><CircleHelp size={17} /><span>{profileError}</span></div>}{profileMessage && <div className="admin-inline-message"><CheckCircle2 size={15} />{profileMessage}</div>}<label className="field-label">Display name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} required maxLength={140} /></label><button className="button-primary" type="submit"><Save size={15} />Save profile</button></form>}<div className="profile-detail-list"><div><span>Role</span><strong>{role}</strong></div><div><span>Branch / institute</span><strong>{authUser?.branch || settings.institute}</strong></div><div><span>Profile data</span><strong>{authUser ? 'Account profile' : 'Sample profile'}</strong></div></div></section><section className="panel preferences-panel"><div className="section-eyebrow">PREFERENCES</div><h2>Notification settings</h2><p>Choose which campus updates to see.</p><label className="preference-row"><span><strong>Academic announcements</strong><small>Schedule and university notice updates</small></span><input type="checkbox" checked={emailUpdates} onChange={(event) => { setEmailUpdates(event.target.checked); setSaved(false) }} /></label><label className="preference-row"><span><strong>Booking updates</strong><small>Changes to your classroom requests</small></span><input type="checkbox" checked={bookingUpdates} onChange={(event) => { setBookingUpdates(event.target.checked); setSaved(false) }} /></label><button className="button-primary" onClick={() => setSaved(true)}>{saved ? <Check size={16} /> : <Settings2 size={16} />}{saved ? 'Preferences saved' : 'Save preferences'}</button><p className="preference-demo-note">Preference switches are demo-only and reset when this page reloads.</p></section></div></div>
}

const adminSections = [
  { id: 'buildings', label: 'Buildings', icon: Building2, detail: 'Building names and descriptions' },
  { id: 'rooms', label: 'Rooms & facilities', icon: DoorOpen, detail: 'Spaces, floors, statuses, capacity' },
  { id: 'schedule', label: 'Academic schedule', icon: CalendarDays, detail: 'Classes, activities, faculty' },
  { id: 'announcements', label: 'Announcements', icon: FileText, detail: 'Notices and examination updates' },
  { id: 'bookings', label: 'Booking approvals', icon: BookmarkCheck, detail: 'Review booking requests' },
  { id: 'settings', label: 'Institution settings', icon: Settings2, detail: 'University identity and profile' },
]

const adminTemplates = {
  buildings: () => ({ id: `building-${Date.now()}`, name: '', shortName: '', subtitle: '', floors: [] }),
  rooms: (buildingData) => ({ name: '', building: buildingData[0]?.id || '', buildingName: buildingData[0]?.shortName || '', floor: '', status: 'available', capacity: null }),
  schedule: (roomData) => ({ subject: '', faculty: '', room: roomData[0]?.name || '', date: todayISO(), time: '09:00 – 10:00', branch: '', color: 'blue' }),
  announcements: () => ({ title: '', category: 'Academic', date: todayISO(), status: 'New', tone: 'blue' }),
}

function AdminPage({ roomData, buildingData, scheduleData, announcementData, bookings, settingsData, onCatalogSaved, setBookings }) {
  const [section, setSection] = useState('buildings')
  const [records, setRecords] = useState({ buildings: buildingData, rooms: roomData, schedule: scheduleData, announcements: announcementData })
  const [settingsDraft, setSettingsDraft] = useState(settingsData)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setRecords({ buildings: buildingData, rooms: roomData, schedule: scheduleData, announcements: announcementData })
    setSettingsDraft(settingsData)
  }, [buildingData, roomData, scheduleData, announcementData, settingsData])

  const currentSection = adminSections.find((item) => item.id === section)
  const currentRecords = records[section] || []
  const activeRecord = currentRecords[selectedIndex]

  function changeSection(id) {
    setSection(id)
    setSelectedIndex(0)
    setError('')
    setMessage('')
  }

  function updateRecord(field, value) {
    setRecords((current) => ({
      ...current,
      [section]: current[section].map((record, index) => {
        if (index !== selectedIndex) return record
        const updated = { ...record, [field]: field === 'capacity' ? (value === '' ? null : Number(value)) : value }
        if (section === 'rooms' && field === 'building') {
          updated.buildingName = current.buildings.find((item) => item.id === value)?.shortName || ''
        }
        return updated
      }),
    }))
    setError('')
    setMessage('Unsaved changes')
  }

  function addRecord() {
    const nextRecord = adminTemplates[section](section === 'rooms' ? records.buildings : records.rooms)
    setRecords((current) => ({ ...current, [section]: [...current[section], nextRecord] }))
    setSelectedIndex(currentRecords.length)
    setError('')
    setMessage('New record — complete the fields and save.')
  }

  function deleteRecord() {
    if (!activeRecord || !window.confirm(`Remove “${recordTitle(activeRecord, section)}” from the local draft? Save the section to apply this change.`)) return
    setRecords((current) => ({ ...current, [section]: current[section].filter((_, index) => index !== selectedIndex) }))
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, currentRecords.length - 2)))
    setError('')
    setMessage('Record removed from draft. Save the section to apply it.')
  }

  async function saveSection() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const value = section === 'settings' ? settingsDraft : records[section]
      const catalog = await campusApi.saveCatalog(section, value)
      onCatalogSaved(catalog)
      setMessage(`${currentSection.label} saved successfully.`)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateBooking(booking, status) {
    setError('')
    setMessage('')
    try {
      const updated = await campusApi.updateBookingStatus(booking.id, status)
      setBookings((current) => current.map((item) => item.id === updated.id ? updated : item))
      setMessage(`Booking for ${updated.room} marked ${status.toLowerCase()}.`)
    } catch (statusError) {
      setError(statusError.message)
    }
  }

  function recordTitle(record, type) {
    if (type === 'buildings') return record.name || 'New building'
    if (type === 'rooms') return record.name || 'New room'
    if (type === 'schedule') return record.subject || 'New schedule entry'
    return record.title || 'New announcement'
  }

  const field = (label, key, options = {}) => <label className="field-label admin-field" key={key}>{label}{options.type === 'select' ? <select value={activeRecord?.[key] ?? ''} onChange={(event) => updateRecord(key, event.target.value)}>{options.items.map((item) => <option key={item.value ?? item} value={item.value ?? item}>{item.label ?? item}</option>)}</select> : options.type === 'textarea' ? <textarea rows={options.rows || 3} value={activeRecord?.[key] ?? ''} onChange={(event) => updateRecord(key, event.target.value)} /> : <input type={options.type || 'text'} min={options.min} step={options.step} value={activeRecord?.[key] ?? ''} onChange={(event) => updateRecord(key, event.target.value)} />}</label>

  return <div className="page-content subpage-content admin-page">
    <PageHeader eyebrow="CAMPUS ADMINISTRATION" title="Admin section" subtitle="Manage the campus information used across CampusIQ."><span className="admin-storage-badge"><span className="live-dot" />Changes save to the local server</span></PageHeader>
    <div className="admin-layout">
      <aside className="panel admin-sidebar"><div className="admin-sidebar-heading"><div className="admin-shield"><ShieldCheck size={18} /></div><div><strong>Manage information</strong><small>Choose a section to edit</small></div></div><div className="admin-section-tabs">{adminSections.map(({ id, label, icon: Icon, detail }) => <button key={id} className={`admin-section-tab ${section === id ? 'active' : ''}`} onClick={() => changeSection(id)}><Icon size={17} /><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={15} /></button>)}</div><div className="admin-sidebar-note"><CircleHelp size={15} /><span>Changes are shared with all CampusIQ pages after saving.</span></div></aside>
      <section className="panel admin-editor">
        <div className="admin-editor-heading"><div><div className="section-eyebrow">{section === 'settings' ? 'SITE-WIDE DETAILS' : section === 'bookings' ? 'REQUEST MANAGEMENT' : 'EDIT CAMPUS DATA'}</div><h2>{currentSection.label}</h2><p>{currentSection.detail}</p></div><div className="admin-editor-actions">{!['settings', 'bookings'].includes(section) && <><button className="button-quiet admin-action-button" onClick={addRecord}><Plus size={15} />Add record</button><button className="icon-button admin-delete-button" aria-label="Remove selected record" title="Remove selected record" onClick={deleteRecord} disabled={!activeRecord}><Trash2 size={16} /></button></>}{section !== 'bookings' && <button className="button-primary admin-action-button" onClick={saveSection} disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save changes'}</button>}</div></div>
        {error && <div className="error-callout admin-message"><CircleHelp size={18} /><span><strong>Couldn’t save changes</strong><small>{error}</small></span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {message && <div className="admin-inline-message"><CheckCircle2 size={15} />{message}</div>}
        {section === 'settings' && <div className="admin-settings-form"><div className="admin-form-grid">{[
          ['University name', 'university'], ['Institute / department', 'institute'], ['Campus location', 'location'], ['Product name', 'productName'], ['Tagline', 'tagline'], ['Academic term', 'academicTerm'], ['Display name', 'displayName'], ['Role label', 'role'],
        ].map(([label, key]) => <label className="field-label admin-field" key={key}>{label}<input value={settingsDraft[key] || ''} onChange={(event) => { setSettingsDraft((current) => ({ ...current, [key]: event.target.value })); setMessage('Unsaved changes') }} /></label>)}</div><p className="admin-help-note"><CircleHelp size={14} />These details update the sidebar, profile, dashboard heading, and page footer.</p></div>}
        {section === 'bookings' && <div className="admin-bookings-list">{bookings.map((booking) => <div className="admin-booking-row" key={booking.id}><span className="booking-row-icon"><CalendarDays size={17} /></span><div className="booking-row-main"><strong>{booking.purpose}</strong><span><DoorOpen size={13} />{booking.room}<b>·</b>{booking.date}<b>·</b>{booking.time}</span></div><select aria-label={`Booking status for ${booking.room}`} value={booking.status} onChange={(event) => updateBooking(booking, event.target.value)}>{['Pending', 'Approved', 'Rejected', 'Completed'].map((status) => <option key={status}>{status}</option>)}</select></div>)}{!bookings.length && <div className="empty-state"><BookmarkCheck size={25} /><strong>No booking requests</strong><span>New requests will appear here for review.</span></div>}</div>}
        {!['settings', 'bookings'].includes(section) && <div className="admin-record-layout"><div className="admin-record-list">{currentRecords.map((record, index) => <button key={`${recordTitle(record, section)}-${index}`} className={`admin-record-item ${selectedIndex === index ? 'selected' : ''}`} onClick={() => setSelectedIndex(index)}><span className="admin-record-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{recordTitle(record, section)}</strong><small>{recordSummary(record, section)}</small></span><Pencil size={14} /></button>)}{!currentRecords.length && <div className="admin-empty-list">No records yet. Add one to get started.</div>}</div><div className="admin-record-form">{activeRecord ? <>
          {section === 'buildings' && <div className="admin-form-grid">{field('Building ID', 'id')}{field('Building name', 'name')}{field('Short name', 'shortName')}{field('Subtitle', 'subtitle')}<p className="admin-help-note field-wide"><CircleHelp size={14} />Floors and room lists are derived from the Rooms & facilities section.</p></div>}
          {section === 'rooms' && <div className="admin-form-grid">{field('Space name', 'name')}{field('Building', 'building', { type: 'select', items: records.buildings.map((item) => ({ value: item.id, label: item.name })) })}{field('Floor / area', 'floor')}{field('Status', 'status', { type: 'select', items: ['available', 'occupied', 'reserved', 'maintenance'] })}{field('Capacity', 'capacity', { type: 'number', min: 1, step: 1 })}<p className="admin-help-note field-wide"><CircleHelp size={14} />Leave capacity blank when it has not been confirmed.</p></div>}
          {section === 'schedule' && <div className="admin-form-grid">{field('Subject / activity', 'subject')}{field('Faculty', 'faculty')}{field('Classroom', 'room', { type: 'select', items: records.rooms.map((item) => item.name) })}{field('Date', 'date', { type: 'date' })}{field('Time slot', 'time', { type: 'select', items: roomTimeSlots.slice(1) })}{field('Branch / section', 'branch')}{field('Colour', 'color', { type: 'select', items: ['blue', 'gold', 'green', 'purple'] })}</div>}
          {section === 'announcements' && <div className="admin-form-grid">{field('Notice title', 'title')}{field('Notice details', 'body', { type: 'textarea', rows: 4 })}{field('Category', 'category')}{field('Date', 'date')}{field('Status label', 'status')}{field('Accent colour', 'tone', { type: 'select', items: ['gold', 'blue', 'green', 'purple'] })}</div>}
        </> : <div className="admin-empty-form">Select a record to edit or add a new one.</div>}</div></div>}
      </section>
    </div>
  </div>
}

function recordSummary(record, section) {
  if (section === 'buildings') return `${record.shortName} · ${record.floors?.length || 0} floors`
  if (section === 'rooms') return `${record.buildingName || record.building} · ${record.floor} · ${statusLabels[record.status] || record.status}`
  if (section === 'schedule') return `${record.room} · ${record.time}`
  return `${record.category} · ${record.date}`
}

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const demoBookings = sampleBookings.map((item, index) => ({ ...item, id: `demo-${index + 1}`, createdAt: null }))
  const [bookings, setBookings] = useState(demoBookings)
  const [roomData, setRoomData] = useState(rooms)
  const [buildingData, setBuildingData] = useState(buildings)
  const [scheduleData, setScheduleData] = useState(scheduleItems)
  const [announcementData, setAnnouncementData] = useState(announcements)
  const [settingsData, setSettingsData] = useState(siteSettings)
  const [apiStatus, setApiStatus] = useState('connecting')
  const [isDemoMode, setIsDemoMode] = useState(true)
  const [authUser, setAuthUser] = useState(campusApi.readUser())
  const [authReady, setAuthReady] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const activeItem = navigation.find((item) => item.to === location.pathname)
  const pageLabel = activeItem?.label || 'Dashboard'
  function setRoute(path) { navigate(path); setMobileOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function applyCatalog(catalog) {
    setRoomData(catalog.rooms)
    setBuildingData(catalog.buildings)
    setScheduleData(catalog.schedule)
    setAnnouncementData(catalog.announcements)
    setSettingsData(catalog.settings)
    setIsDemoMode(catalog.demoMode ?? true)
  }

  async function loadAccountData(user) {
    const [, catalog, apiBookings] = await Promise.all([campusApi.health(), campusApi.getCatalog(), campusApi.getBookings()])
    applyCatalog(catalog)
    setBookings(apiBookings)
    setAuthUser(user)
    setApiStatus('online')
  }

  async function signOut() {
    try { await campusApi.logout() } catch { /* local token is cleared even when the API is offline */ }
    setAuthUser(null)
    setBookings(demoBookings)
    setRoute('/')
  }

  useEffect(() => {
    let active = true
    async function bootstrap() {
      const token = globalThis.localStorage?.getItem(campusApi.tokenKey)
      if (token) {
        try { const user = await campusApi.me(); await loadAccountData(user) }
        catch { globalThis.localStorage?.removeItem(campusApi.tokenKey); globalThis.localStorage?.removeItem('campusiq-user'); if (active) { setAuthUser(null); setBookings(demoBookings) } }
      } else setBookings(demoBookings)
      try { await campusApi.health(); if (active) setApiStatus('online') } catch { if (active) setApiStatus('offline') }
      if (active) setAuthReady(true)
    }
    bootstrap()
    const expireSession = () => { if (active) { setAuthUser(null); setBookings(demoBookings); setRoute('/login') } }
    window.addEventListener('campusiq:auth-expired', expireSession)
    return () => { active = false; window.removeEventListener('campusiq:auth-expired', expireSession) }
  }, [])

  useEffect(() => {
    document.title = `${settingsData.productName} | DDUGU IET`
  }, [settingsData.productName])

  async function handleAuthenticated(user) { await loadAccountData(user); setRoute('/') }
  if (!authReady) return <div className="app-shell"><main className="page-content"><div className="panel empty-state"><Activity size={24} /><strong>Loading CampusIQ</strong><span>Checking your session and campus data.</span></div></main></div>

  return <DataModeContext.Provider value={isDemoMode}><div className="app-shell">
    <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onToggle={() => setCollapsed(!collapsed)} onClose={() => setMobileOpen(false)} apiStatus={apiStatus} settings={settingsData} announcementData={announcementData} authUser={authUser} />
    <div className={`app-main ${collapsed ? 'main-expanded' : ''}`}>
      <Header onMenu={() => setMobileOpen(true)} onExpand={() => setCollapsed(!collapsed)} collapsed={collapsed} pageLabel={pageLabel} roomData={roomData} announcementData={announcementData} settings={settingsData} authUser={authUser} onSignOut={signOut} />
      <div className="mobile-page-label"><span>{pageLabel}</span><span>DDUGU · IET</span></div>
      <Routes>
        <Route path="/" element={<Dashboard onBooking={() => setRoute('/book')} setRoute={setRoute} setSelectedRoom={setSelectedRoom} roomData={roomData} buildingData={buildingData} scheduleData={scheduleData} announcementData={announcementData} bookingsData={bookings} settings={settingsData} />} />
        <Route path="/rooms" element={<RoomsPage selectedRoom={selectedRoom} setSelectedRoom={setSelectedRoom} roomData={roomData} buildingData={buildingData} scheduleData={scheduleData} />} />
        <Route path="/book" element={<BookingPage setBookings={setBookings} roomData={roomData} buildingData={buildingData} authUser={authUser} />} />
        <Route path="/login" element={<LoginPage onAuthenticated={handleAuthenticated} />} />
        <Route path="/schedule" element={<SchedulePage scheduleData={scheduleData} settings={settingsData} />} />
        <Route path="/examinations" element={<AnnouncementsPage examsOnly announcementData={announcementData} />} />
        <Route path="/announcements" element={<AnnouncementsPage announcementData={announcementData} />} />
        <Route path="/buildings" element={<BuildingsPage selectedRoom={selectedRoom} setSelectedRoom={setSelectedRoom} roomData={roomData} buildingData={buildingData} settings={settingsData} />} />
        <Route path="/bookings" element={<BookingsPage bookings={bookings} onBook={() => setRoute('/book')} />} />
        <Route path="/admin" element={authUser?.role === 'ADMIN' ? <AdminPage roomData={roomData} buildingData={buildingData} scheduleData={scheduleData} announcementData={announcementData} bookings={bookings} settingsData={settingsData} onCatalogSaved={applyCatalog} setBookings={setBookings} /> : <div className="page-content subpage-content"><PageHeader eyebrow="CAMPUS ADMINISTRATION" title="Admin access required" subtitle="Administrator sign-in is required to manage campus records."><button className="button-primary" onClick={() => setRoute('/login')}>Sign in</button></PageHeader></div>} />
        <Route path="/profile" element={<ProfilePage settings={settingsData} authUser={authUser} onProfileUpdated={setAuthUser} />} />
        <Route path="*" element={<Dashboard onBooking={() => setRoute('/book')} setRoute={setRoute} setSelectedRoom={setSelectedRoom} roomData={roomData} buildingData={buildingData} scheduleData={scheduleData} announcementData={announcementData} bookingsData={bookings} settings={settingsData} />} />
      </Routes>
    </div>
  </div></DataModeContext.Provider>
}

export default App
