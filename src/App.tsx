import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Characters from '@/pages/Characters'
import CharacterDetail from '@/pages/CharacterDetail'
import Substat from '@/pages/Substat'
import Team from '@/pages/Team'
import UidImport from '@/pages/UidImport'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="characters" element={<Characters />} />
          <Route path="characters/:id" element={<CharacterDetail />} />
          {/* Legacy /calc redirects to the character browser */}
          <Route path="calc" element={<Navigate to="/characters" replace />} />
          <Route path="substat" element={<Substat />} />
          <Route path="team" element={<Team />} />
          <Route path="uid" element={<UidImport />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
