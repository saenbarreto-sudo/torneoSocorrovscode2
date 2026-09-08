import { useEffect } from 'react';
import { useGetAjustes, useUpdateAjustes } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';

/** Un valor en pesos, siempre entero y no negativo. */
const valorPesos = (mensaje: string) =>
  z.coerce.number({ invalid_type_error: mensaje }).int(mensaje).nonnegative(mensaje);

const ajustesSchema = z.object({
  valorArbitraje: valorPesos('El valor del arbitraje debe ser un número entero'),
  valorAmarilla: valorPesos('El valor de la amarilla debe ser un número entero'),
  valorRoja: valorPesos('El valor de la roja debe ser un número entero'),
  valorFofi: valorPesos('El valor del FOFI debe ser un número entero'),
  valorMultaTorneosAnteriores: valorPesos('El valor debe ser un número entero'),
  valorTraspaso: valorPesos('El valor del traspaso debe ser un número entero'),
});

type AjustesFormValues = z.infer<typeof ajustesSchema>;

const CAMPOS: Array<{ name: keyof AjustesFormValues; label: string; ayuda?: string }> = [
  {
    name: 'valorAmarilla',
    label: 'Tarjeta amarilla',
    ayuda: 'Se asigna solo, en el momento en que la mesa registra la tarjeta en la planilla del partido.',
  },
  {
    name: 'valorRoja',
    label: 'Tarjeta roja',
    ayuda: 'Se asigna solo, igual que la amarilla.',
  },
  { name: 'valorArbitraje', label: 'Arbitraje' },
  { name: 'valorFofi', label: 'FOFI' },
  { name: 'valorTraspaso', label: 'Traspaso de jugador' },
  { name: 'valorMultaTorneosAnteriores', label: 'Multa por deudas de torneos anteriores' },
];

export default function Ajustes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: ajustes, isLoading } = useGetAjustes();
  const updateMutation = useUpdateAjustes();

  const form = useForm<AjustesFormValues>({
    resolver: zodResolver(ajustesSchema),
    defaultValues: {
      valorArbitraje: 0,
      valorAmarilla: 0,
      valorRoja: 0,
      valorFofi: 0,
      valorMultaTorneosAnteriores: 0,
      valorTraspaso: 0,
    },
  });

  // Repone el formulario cuando llegan los ajustes guardados (o cuando se
  // actualizan desde otra sesión).
  useEffect(() => {
    if (ajustes) {
      form.reset({
        valorArbitraje: ajustes.valorArbitraje,
        valorAmarilla: ajustes.valorAmarilla,
        valorRoja: ajustes.valorRoja,
        valorFofi: ajustes.valorFofi,
        valorMultaTorneosAnteriores: ajustes.valorMultaTorneosAnteriores,
        valorTraspaso: ajustes.valorTraspaso,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajustes]);

  const onSubmit = (data: AjustesFormValues) => {
    updateMutation.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/ajustes'] });
          toast({ title: 'Ajustes guardados' });
        },
        onError: (err) => {
          toast({ title: 'No se pudieron guardar', description: extractErrorMessage(err), variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-lg">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Ajustes</h1>
          <p className="text-muted-foreground mt-1">Valores en pesos que usa todo el torneo</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <p className="text-center py-10 text-muted-foreground">Cargando...</p>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {CAMPOS.map(({ name, label, ayuda }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                            <Input type="number" className="pl-7" {...field} />
                          </div>
                        </FormControl>
                        {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <div className="pt-2">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Guardando...' : 'Guardar ajustes'}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cambiar un valor acá no modifica lo que ya está guardado — por ejemplo, las tarjetas ya
        registradas conservan el valor con el que se crearon. Solo se usa el valor nuevo desde ese
        momento en adelante.
      </p>
    </div>
  );
}
