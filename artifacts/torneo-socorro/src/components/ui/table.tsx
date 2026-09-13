import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * `variant="torneo"`: el mismo look de las tablas impresas (ver
 * components/tabla-imprimible.tsx) — encabezado morado con letras blancas y
 * filas alternadas. Es para las tablas que se leen (posiciones, goleadores,
 * plantilla, sancionados...), no para las de administrar, que llevan
 * filtros y controles dentro del encabezado y ahí el morado estorba.
 *
 * Los colores salen de los tokens del tema, así que en modo oscuro se
 * adaptan solos en vez de quedar un morado claro sobre fondo negro.
 */
interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  variant?: "torneo"
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, variant, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn(
          "w-full caption-bottom text-sm",
          // La zebra vive en index.css (.tabla-torneo): necesita un selector
          // que respete el fondo propio de ciertas filas.
          variant === "torneo" && [
            "tabla-torneo",
            "[&_thead_tr]:bg-primary [&_thead_tr]:border-b-0 [&_thead_tr:hover]:bg-primary",
            "[&_thead_th]:text-primary-foreground [&_thead_th]:uppercase [&_thead_th]:text-[11px] [&_thead_th]:tracking-wide",
          ],
          className
        )}
        {...props}
      />
    </div>
  )
)
Table.displayName = "Table"

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b bg-muted/50", className)} {...props} />
  )
)
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
)
TableBody.displayName = "TableBody"

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
)
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-10 px-4 text-left align-middle font-bold text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
)
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  )
)
TableCell.displayName = "TableCell"

export {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
}