import { useNavigate } from 'react-router-dom'
import { EventForm } from './EventForm'

export function AddEventForm() {
  const navigate = useNavigate()
  return <EventForm mode="create" onCancel={() => navigate('/events/all')} onSaved={() => navigate('/events/all')} />
}
