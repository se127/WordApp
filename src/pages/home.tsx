import { Button } from '@/components/ui/button'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'

const homeRouteApi = getRouteApi('/')

// Home page. The title carries the document count from the home route's own
// count query, refreshed on every visit through the router's stale time of
// zero; the button stores a fresh untitled document and opens that document's
// page.
function HomePage() {
  const documentCount = homeRouteApi.useLoaderData()
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)

  const addDocument = async (): Promise<void> => {
    setIsCreating(true)
    try {
      const document = await window.WordApp?.documents.create()
      if (!document) {
        return
      }

      await navigate({
        to: '/documents/$documentId',
        params: { documentId: String(document.id) },
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-start gap-3 p-6">
      <h1 className="text-2xl font-semibold">
        {documentCount === undefined ? 'مستندات' : `مستندات (${documentCount})`}
      </h1>
      <Button disabled={isCreating} onClick={addDocument}>
        <Plus />
        افزودن سند
      </Button>
    </div>
  )
}

export { HomePage }
