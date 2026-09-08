import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, X } from 'lucide-react';
import {
  useCreateJugador,
  useUpdateJugador,
  useGetEquipos,
  getGetJugadoresQueryKey,
  getGetJugadorQueryKey,
  getGetJugadorHistorialQueryKey,
  type Jugador,
} from '@workspace/api-client-react';
import { extractErrorMessage } from '@/lib/api-errors';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

/**
 * Edad que cumple el jugador dentro del año del torneo (Art. 10.1). Ver
 * misma función en el backend (routes/jugadores.ts) — se duplica aquí solo
 * para dar feedback inmediato en el formulario.
 */
function edadEnElAno(fechaNacimiento: string): number {
  return new Date().getFullYear() - new Date(fechaNacimiento).getFullYear();
}

const EDAD_MINIMA = 40;
// Límite generoso para la foto en base64 (el body JSON del backend acepta
// hasta 8mb; se deja margen para el overhead del data URL).
const FOTO_MAX_BYTES = 5 * 1024 * 1024;

// z.coerce.number() por sí solo no sirve para un campo numérico opcional: si
// se deja vacío, el input manda "" y Number("") da 0 (no "sin dato"); si se
// escriben letras, Number("abc") da NaN, que sigue siendo de tipo "number"
// para JS, así que pasaría la validación sin avisar nada. Esta unión evita
// las dos trampas: "" se acepta tal cual (campo vacío, válido), y cualquier
// otra cosa tiene que ser de verdad un número entero o se rechaza.
function campoNumericoOpcional(mensaje: string) {
  return z.union([
    z.literal(''),
    z.coerce.number({ invalid_type_error: mensaje }).int(mensaje).nonnegative(mensaje),
  ]);
}

const jugadorSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  cedula: z
    .string()
    .min(1, 'La cédula es obligatoria')
    .regex(/^\d+$/, 'La cédula debe contener solo números, sin puntos ni espacios'),
  fechaNacimiento: z.string().optional(),
  equipoId: z.coerce.number().min(1, 'Seleccione un equipo'),
  nCarnet: campoNumericoOpcional('El número de carné debe ser un número entero').optional(),
  foto: z.string().optional(),
  fechaFoto: z.string().optional(),
  // --- Carnetización ---
  carnetPagado: z.boolean().optional(),
  carnetFechaPago: z.string().optional(),
  carnetValor: campoNumericoOpcional('El valor debe ser un número entero').optional(),
  carnetFechaEntrega: z.string().optional(),
  carnetQuienRecibio: z.string().optional(),
}).refine(
  (d) => !d.fechaNacimiento || edadEnElAno(d.fechaNacimiento) >= EDAD_MINIMA,
  {
    path: ['fechaNacimiento'],
    message: `El jugador debe cumplir al menos ${EDAD_MINIMA} años este año (Art. 10.1).`,
  },
);

type JugadorFormValues = z.infer<typeof jugadorSchema>;

const soloFecha = (v: string | null | undefined) => (v ? v.split('T')[0] : '');

function valoresPorDefecto(jugador: Jugador | null, defaultEquipoId?: number): JugadorFormValues {
  return {
    nombre: jugador?.nombre ?? '',
    cedula: jugador?.cedula ?? '',
    fechaNacimiento: soloFecha(jugador?.fechaNacimiento),
    equipoId: jugador?.equipoId ?? defaultEquipoId ?? 0,
    nCarnet: jugador?.nCarnet ?? undefined,
    foto: jugador?.foto ?? undefined,
    fechaFoto: soloFecha(jugador?.fechaFoto),
    carnetPagado: jugador?.carnetPagado ?? false,
    carnetFechaPago: soloFecha(jugador?.carnetFechaPago),
    carnetValor: jugador?.carnetValor ?? '',
    carnetFechaEntrega: soloFecha(jugador?.carnetFechaEntrega),
    carnetQuienRecibio: jugador?.carnetQuienRecibio ?? '',
  };
}

interface JugadorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = creando un jugador nuevo; con datos = editando ese jugador. */
  jugador: Jugador | null;
  /** Equipo preseleccionado al crear (p. ej. si la lista está filtrada por equipo). */
  defaultEquipoId?: number;
  onSaved?: (jugador: Jugador) => void;
}

export function JugadorFormDialog({ open, onOpenChange, jugador, defaultEquipoId, onSaved }: JugadorFormDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);

  const { data: equipos } = useGetEquipos();
  const createMutation = useCreateJugador();
  const updateMutation = useUpdateJugador();

  const form = useForm<JugadorFormValues>({
    resolver: zodResolver(jugadorSchema),
    defaultValues: valoresPorDefecto(jugador, defaultEquipoId),
  });

  // Repone el formulario cada vez que se abre (o cambia a qué jugador
  // apunta), en vez de solo al montar, porque el diálogo se reutiliza.
  useEffect(() => {
    if (open) {
      form.reset(valoresPorDefecto(jugador, defaultEquipoId));
      setErrorFoto(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jugador]);

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
    reader.onload = () => {
      form.setValue('foto', reader.result as string, { shouldDirty: true });
      if (!form.getValues('fechaFoto')) {
        form.setValue('fechaFoto', new Date().toISOString().slice(0, 10));
      }
    };
    reader.readAsDataURL(file);
  }

  function quitarFoto() {
    form.setValue('foto', undefined, { shouldDirty: true });
    setErrorFoto(null);
  }

  const onSubmit = (values: JugadorFormValues) => {
    // Los campos numéricos vacíos viajan como "" desde los inputs. carnetValor
    // acepta null en la API (así se guarda "sin dato"); nCarnet no acepta
    // null, así que ahí toca omitirlo (undefined) en vez de mandar null.
    const numeroONull = (v: number | '' | undefined) => (v === '' || v === undefined ? null : Number(v));
    const numeroOUndefined = (v: number | '' | undefined) => (v === '' || v === undefined ? undefined : Number(v));
    const data = {
      ...values,
      nCarnet: numeroOUndefined(values.nCarnet),
      carnetPagado: values.carnetPagado ?? false,
      carnetFechaPago: values.carnetFechaPago || null,
      carnetValor: numeroONull(values.carnetValor),
      carnetFechaEntrega: values.carnetFechaEntrega || null,
      carnetQuienRecibio: values.carnetQuienRecibio || null,
    };

    const onSuccess = (saved: Jugador) => {
      queryClient.invalidateQueries({ queryKey: getGetJugadoresQueryKey() });
      if (jugador) {
        queryClient.invalidateQueries({ queryKey: getGetJugadorQueryKey(jugador.id) });
        queryClient.invalidateQueries({ queryKey: getGetJugadorHistorialQueryKey(jugador.id) });
      }
      toast({ title: jugador ? 'Jugador actualizado' : 'Jugador creado' });
      onOpenChange(false);
      onSaved?.(saved);
    };
    const onError = (err: unknown) => {
      toast({ title: 'No se pudo guardar', description: extractErrorMessage(err), variant: 'destructive' });
    };

    if (jugador) {
      updateMutation.mutate({ id: jugador.id, data }, { onSuccess, onError });
    } else {
      createMutation.mutate({ data }, { onSuccess, onError });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* El formulario es largo (datos + carnetización de dos categorías),
          así que se limita la altura y se deja desplazar. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{jugador ? 'Editar Jugador' : 'Nuevo Jugador'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="shrink-0">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-md border-2 border-dashed border-input bg-muted overflow-hidden flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  {foto ? (
                    <img src={foto} alt="Foto del jugador" className="w-full h-full object-cover" />
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
                <FormField
                  control={form.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Completo</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cedula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cédula</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nCarnet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° Carnet</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="equipoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione equipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {equipos
                          ?.filter((eq) => eq.activo || eq.id === field.value)
                          .map((eq) => (
                            <SelectItem key={eq.id} value={eq.id.toString()}>
                              {eq.nombre}{!eq.activo && ' (inactivo)'}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fechaNacimiento"
                render={({ field }) => {
                  const edad = field.value ? edadEnElAno(field.value) : null;
                  return (
                    <FormItem>
                      <FormLabel>F. Nacimiento</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      {edad != null && edad < 40 && (
                        <p className="text-xs text-destructive font-medium">
                          Cumple {edad} años este año. No se puede registrar: el mínimo es 40 (Art. 10.1).
                        </p>
                      )}
                    </FormItem>
                  );
                }}
              />
            </div>

            {/* Carnetización */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="text-sm font-bold">Carnetización</h4>
                <FormField
                  control={form.control}
                  name="carnetPagado"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                      Pagó el carné
                    </label>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fechaFoto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de la foto</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="carnetFechaPago"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de pago</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="carnetValor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor pagado</FormLabel>
                      <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="carnetFechaEntrega"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Entrega del carné</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="carnetQuienRecibio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quién lo recibió</FormLabel>
                      <FormControl><Input placeholder="Ej. El delegado" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>


            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
