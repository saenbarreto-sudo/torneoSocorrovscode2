import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, X } from 'lucide-react';
import {
  useCrearArbitro,
  useActualizarArbitro,
  getGetArbitrosQueryKey,
  getGetEstadisticasArbitrosQueryKey,
  getGetFichaArbitroQueryKey,
  type Arbitro,
} from '@workspace/api-client-react';
import { extractErrorMessage } from '@/lib/api-errors';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// Mismo límite que la foto de carné del jugador: el body del backend acepta
// hasta 8mb y se deja margen para el peso extra del data URL.
const FOTO_MAX_BYTES = 5 * 1024 * 1024;

const arbitroSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  telefono: z.string().optional(),
  foto: z.string().optional(),
  activo: z.boolean().optional(),
  notas: z.string().optional(),
});

type ArbitroFormValues = z.infer<typeof arbitroSchema>;

function valoresPorDefecto(arbitro: Arbitro | null): ArbitroFormValues {
  return {
    nombre: arbitro?.nombre ?? '',
    telefono: arbitro?.telefono ?? '',
    foto: arbitro?.foto ?? undefined,
    activo: arbitro?.activo ?? true,
    notas: arbitro?.notas ?? '',
  };
}

interface ArbitroFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = creando un árbitro nuevo; con datos = editando ese árbitro. */
  arbitro: Arbitro | null;
  onSaved?: (arbitro: Arbitro) => void;
}

/**
 * Crear o editar un árbitro. Se usa tanto desde el listado de Árbitros
 * como, en su versión "crear rápido", desde el selector que aparece al
 * asignar árbitro a un partido — así nunca hay que salirse de esa pantalla
 * solo para dar de alta a alguien nuevo.
 */
export function ArbitroFormDialog({ open, onOpenChange, arbitro, onSaved }: ArbitroFormDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCrearArbitro();
  const updateMutation = useActualizarArbitro();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);

  const form = useForm<ArbitroFormValues>({
    resolver: zodResolver(arbitroSchema),
    defaultValues: valoresPorDefecto(arbitro),
  });

  useEffect(() => {
    if (open) {
      form.reset(valoresPorDefecto(arbitro));
      setErrorFoto(null);
    }
  }, [open, arbitro]); // eslint-disable-line react-hooks/exhaustive-deps

  const foto = form.watch('foto');

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > FOTO_MAX_BYTES) {
      setErrorFoto('La foto es muy pesada (máximo 5 MB).');
      return;
    }
    setErrorFoto(null);
    const reader = new FileReader();
    reader.onload = () => form.setValue('foto', reader.result as string, { shouldDirty: true });
    reader.readAsDataURL(file);
  }

  function quitarFoto() {
    // Cadena vacía y no undefined: así el backend recibe null y borra la
    // foto guardada, en vez de dejar el campo como estaba.
    form.setValue('foto', '', { shouldDirty: true });
    setErrorFoto(null);
  }

  const onSubmit = (values: ArbitroFormValues) => {
    const data = {
      nombre: values.nombre,
      telefono: values.telefono || undefined,
      foto: values.foto === undefined ? undefined : values.foto || null,
      activo: values.activo ?? true,
      notas: values.notas || undefined,
    };

    const onSuccess = (guardado: Arbitro) => {
      queryClient.invalidateQueries({ queryKey: getGetArbitrosQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetEstadisticasArbitrosQueryKey() });
      if (arbitro) queryClient.invalidateQueries({ queryKey: getGetFichaArbitroQueryKey(arbitro.id) });
      toast({ title: arbitro ? 'Árbitro actualizado' : 'Árbitro creado' });
      onOpenChange(false);
      onSaved?.(guardado);
    };
    const onError = (err: unknown) => {
      toast({ title: 'No se pudo guardar', description: extractErrorMessage(err), variant: 'destructive' });
    };

    if (arbitro) {
      updateMutation.mutate({ id: arbitro.id, data }, { onSuccess, onError });
    } else {
      createMutation.mutate({ data }, { onSuccess, onError });
    }
  };

  const guardando = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{arbitro ? 'Editar árbitro' : 'Nuevo árbitro'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="shrink-0">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Poner una foto"
                  className="relative w-20 h-20 rounded-full border-2 border-dashed border-input bg-muted overflow-hidden flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  {foto ? (
                    <img src={foto} alt="Foto del árbitro" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="h-6 w-6" />
                  )}
                </button>
                {foto && (
                  <button
                    type="button"
                    onClick={quitarFoto}
                    className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive mx-auto"
                  >
                    <X className="h-3 w-3" /> Quitar
                  </button>
                )}
                {errorFoto && <p className="text-xs text-destructive mt-1 max-w-20">{errorFoto}</p>}
              </div>

              <div className="flex-1 min-w-0 space-y-4">
                <FormField control={form.control} name="nombre" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl><Input placeholder="Nombre completo" {...field} autoFocus /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="telefono" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl><Input placeholder="Opcional" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>
            <FormField control={form.control} name="notas" render={({ field }) => (
              <FormItem>
                <FormLabel>Notas</FormLabel>
                <FormControl><Textarea placeholder="Opcional" rows={2} {...field} /></FormControl>
              </FormItem>
            )} />
            {arbitro && (
              <FormField control={form.control} name="activo" render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0 font-normal cursor-pointer">
                    Sigue arbitrando (aparece para asignarlo a partidos nuevos)
                  </FormLabel>
                </FormItem>
              )} />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
