import { RouterProvider } from 'react-router-dom'
import { appRouter } from './app/router'
import { ToastViewport } from './components/common/ToastViewport'

export default function App() {
  return (
    <>
      <RouterProvider router={appRouter} />
      <ToastViewport />
    </>
  )
}
