import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import SingleChar from '@/pages/SingleChar'
import Substat from '@/pages/Substat'
import Team from '@/pages/Team'
import UidImport from '@/pages/UidImport'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  return (
    <BrowserRouter basename={base}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="calc" element={<SingleChar />} />
          <Route path="substat" element={<Substat />} />
          <Route path="team" element={<Team />} />
          <Route path="uid" element={<UidImport />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
