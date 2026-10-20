import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { formatNumber } from '@/lib/number'
import { paginationEntries } from '@/lib/pagination'
import { cn } from '@/lib/utils'

const disabledClassName = 'pointer-events-none opacity-50'

function DocumentsPagination({
  page,
  totalPages,
  isDisabled,
  onPageChange,
}: {
  page: number
  totalPages: number
  isDisabled: boolean
  onPageChange: (page: number) => void
}) {
  return (
    <Pagination aria-label="صفحه بندی اسناد" className="pt-2">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text="قبلی"
            aria-label="صفحه ی قبلی"
            aria-disabled={isDisabled || page <= 1}
            tabIndex={isDisabled || page <= 1 ? -1 : undefined}
            className={cn((isDisabled || page <= 1) && disabledClassName)}
            onClick={(event) => {
              event.preventDefault()
              if (isDisabled || page <= 1) {
                return
              }
              onPageChange(page - 1)
            }}
          />
        </PaginationItem>

        {paginationEntries(page, totalPages).map((entry) =>
          typeof entry === 'number' ? (
            <PaginationItem key={entry}>
              <PaginationLink
                href="#"
                isActive={entry === page}
                aria-label={`صفحه ی ${formatNumber(entry)}`}
                aria-disabled={isDisabled || entry === page}
                tabIndex={isDisabled || entry === page ? -1 : undefined}
                className={cn(isDisabled && disabledClassName)}
                onClick={(event) => {
                  event.preventDefault()
                  if (isDisabled || entry === page) {
                    return
                  }
                  onPageChange(entry)
                }}
              >
                {formatNumber(entry)}
              </PaginationLink>
            </PaginationItem>
          ) : (
            <PaginationItem key={entry}>
              <PaginationEllipsis />
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            href="#"
            text="بعدی"
            aria-label="صفحه ی بعدی"
            aria-disabled={isDisabled || page >= totalPages}
            tabIndex={isDisabled || page >= totalPages ? -1 : undefined}
            className={cn(
              (isDisabled || page >= totalPages) && disabledClassName,
            )}
            onClick={(event) => {
              event.preventDefault()
              if (isDisabled || page >= totalPages) {
                return
              }
              onPageChange(page + 1)
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

export { DocumentsPagination }
