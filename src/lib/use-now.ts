import { useEffect, useState } from 'react'

const nowRefreshMs = 60_000

function useNow(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, nowRefreshMs)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return now
}

export { useNow }
