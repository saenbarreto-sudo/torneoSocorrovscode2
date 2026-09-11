import { useEffect } from 'react';
import { useGetAjustes, useUpdateAjustes } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings } from 'lucide-react';
import { useForm, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { extractErrorMessage } from '@/lib/api-errors';

/** Un valor en pesos, siempre entero y no negativo. */
const valorPesos = (mensaje: string) =>
  z.coerce.number({ invalid_type_error: mensaje }).int(mensaje).nonnegative(mensaje);

const ajustesSchema = z.object({
  valorArbitrajePrimeraVuelta: valorPesos('El valor del arbitraje debe ser un número entero'),
  valorArbitrajeSegundaVuelta: valorPesos('El valor del arbitraje debe ser un número entero'),
  valorArbitrajeFinalLiguilla: valorPesos('El valor del arbitraje debe ser un número entero'),
  valorTernaFinalLiguilla: valorPesos('El valor de la terna debe ser un número entero'),
  ternaFinalLiguilla: z.boolean(),
  valorArbitrajeMuerteSubita: valorPesos('El valor del arbitraje debe ser un número entero'),
  valorTernaMuerteSubita: valorPesos('El valor de la terna debe ser un número entero'),
  ternaMuerteSubita: z.boolean(),
  valorArbitrajeSemifinalLiguilla: valorPesos('El valor del arbitraje debe ser un número entero'),
  valorTernaSemifinalLiguilla: valorPesos('El valor de la terna debe ser un número entero'),
  ternaSemifinalLiguilla: z.boolean(),
  valorArbitrajeSemifinalTorneo: valorPesos('El valor del arbitraje debe ser un número entero'),
  valorTernaSemifinalTorneo: valorPesos('El valor de la terna debe ser un número entero'),
  ternaSemifinalTorneo: z.boolean(),
  valorArbitrajeFinalTorneo: valorPesos('El valor del arbitraje debe ser un número entero'),
  valorTernaFinalTorneo: valorPesos('El valor de la terna debe ser un número entero'),
  ternaFinalTorneo: z.boolean(),
  valorMesa: valorPesos('El valor de la mesa debe ser un número entero'),
  valorCintaCapitan: valorPesos('El valor de la cinta debe ser un número entero'),
  valorAmarilla: valorPesos('El valor de la amarilla debe ser un número entero'),
  valorRoja: valorPesos('El valor de la roja debe ser un número entero'),
  valorFofi: valorPesos('El valor del FOFI debe ser un número entero'),
  valorCarnet: valorPesos('El valor del carné debe ser un número entero'),
  valorMultaTorneosAnteriores: valorPesos('El valor debe ser un número entero'),
  valorTraspaso: valorPesos('El valor del traspaso debe ser un número entero'),
});

type AjustesFormValues = z.infer<typeof ajustesSchema>;

/** Los nombres de campo que son un valor en pesos (todos menos las casillas "Terna"). */
type CampoNumero = Exclude<
  keyof AjustesFormValues,
  'ternaFinalLiguilla' | 'ternaMuerteSubita' | 'ternaSemifinalLiguilla' | 'ternaSemifinalTorneo' | 'ternaFinalTorneo'
>;

const CAMPOS_GENERALES: Array<{ name: CampoNumero; label: string; ayuda?: string }> = [
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
  {
    name: 'valorMesa',
    label: 'Mesa (por equipo, por partido)',
    ayuda: 'Lo que paga cada equipo por el arbitraje de cada partido. En las fases que se juegan con terna, cada equipo paga el doble.',
  },
  {
    name: 'valorCintaCapitan',
    label: 'Cinta de capitán',
    ayuda: 'Lo que se cobra por cada cinta vendida en la mesa.',
  },
  { name: 'valorCarnet', label: 'Carné' },
  { name: 'valorTraspaso', label: 'Traspaso de jugador' },
  { name: 'valorMultaTorneosAnteriores', label: 'Multa por deudas de torneos anteriores' },
];

/** Fases que siempre se pagan con 1 árbitro: un solo valor cada una. */
const CAMPOS_ARBITRAJE_SIMPLE: Array<{ name: CampoNumero; label: string }> = [
  { name: 'valorArbitrajePrimeraVuelta', label: 'Primera vuelta' },
  { name: 'valorArbitrajeSegundaVuelta', label: 'Segunda vuelta' },
  { name: 'valorFofi', label: 'FOFI' },
];

/**
 * Fases que se deciden más cerca de la fecha: se puede pagar con 1 árbitro o
 * con terna (3 árbitros), por eso cada una trae los dos valores y una
 * casilla que dice cuál de los dos aplica.
 */
const FASES_CON_TERNA: Array<{ label: string; arbitro: CampoNumero; terna: CampoNumero; casilla: keyof AjustesFormValues }> = [
  {
    label: 'Final liguilla',
    arbitro: 'valorArbitrajeFinalLiguilla',
    terna: 'valorTernaFinalLiguilla',
    casilla: 'ternaFinalLiguilla',
  },
  {
    label: 'Muerte súbita',
    arbitro: 'valorArbitrajeMuerteSubita',
    terna: 'valorTernaMuerteSubita',
    casilla: 'ternaMuerteSubita',
  },
  {
    label: 'Semifinal liguilla',
    arbitro: 'valorArbitrajeSemifinalLiguilla',
    terna: 'valorTernaSemifinalLiguilla',
    casilla: 'ternaSemifinalLiguilla',
  },
  {
    label: 'Semifinal del torneo',
    arbitro: 'valorArbitrajeSemifinalTorneo',
    terna: 'valorTernaSemifinalTorneo',
    casilla: 'ternaSemifinalTorneo',
  },
  {
    label: 'Final del torneo',
    arbitro: 'valorArbitrajeFinalTorneo',
    terna: 'valorTernaFinalTorneo',
    casilla: 'ternaFinalTorneo',
  },
];

function CampoPeso({
  control,
  name,
  label,
  ayuda,
}: {
  control: Control<AjustesFormValues>;
  name: CampoNumero;
  label: string;
  ayuda?: string;
}) {
  return (
    <FormField
      control={control}
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
  );
}

function BloqueFaseConTerna({
  control,
  fase,
}: {
  control: Control<AjustesFormValues>;
  fase: (typeof FASES_CON_TERNA)[number];
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="font-semibold text-sm">{fase.label}</p>
      <div className="grid grid-cols-2 gap-3">
        <CampoPeso control={control} name={fase.arbitro} label="1 árbitro" />
        <CampoPeso control={control} name={fase.terna} label="Terna" />
      </div>
      <FormField
        control={control}
        name={fase.casilla}
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2 space-y-0">
            <FormControl>
              <Checkbox checked={field.value as boolean} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="mt-0! font-normal cursor-pointer text-sm">
              Se paga como terna (si no se marca, se paga con 1 árbitro)
            </FormLabel>
          </FormItem>
        )}
      />
    </div>
  );
}

export default function Ajustes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: ajustes, isLoading } = useGetAjustes();
  const updateMutation = useUpdateAjustes();

  const form = useForm<AjustesFormValues>({
    resolver: zodResolver(ajustesSchema),
    defaultValues: {
      valorArbitrajePrimeraVuelta: 0,
      valorArbitrajeSegundaVuelta: 0,
      valorFofi: 0,
      valorArbitrajeFinalLiguilla: 0,
      valorTernaFinalLiguilla: 0,
      ternaFinalLiguilla: false,
      valorArbitrajeMuerteSubita: 0,
      valorTernaMuerteSubita: 0,
      ternaMuerteSubita: false,
      valorArbitrajeSemifinalLiguilla: 0,
      valorTernaSemifinalLiguilla: 0,
      ternaSemifinalLiguilla: false,
      valorArbitrajeSemifinalTorneo: 0,
      valorTernaSemifinalTorneo: 0,
      ternaSemifinalTorneo: false,
      valorArbitrajeFinalTorneo: 0,
      valorTernaFinalTorneo: 0,
      ternaFinalTorneo: false,
      valorMesa: 0,
      valorCintaCapitan: 0,
      valorAmarilla: 0,
      valorRoja: 0,
      valorCarnet: 0,
      valorMultaTorneosAnteriores: 0,
      valorTraspaso: 0,
    },
  });

  // Repone el formulario cuando llegan los ajustes guardados (o cuando se
  // actualizan desde otra sesión).
  useEffect(() => {
    if (ajustes) {
      form.reset({
        valorArbitrajePrimeraVuelta: ajustes.valorArbitrajePrimeraVuelta,
        valorArbitrajeSegundaVuelta: ajustes.valorArbitrajeSegundaVuelta,
        valorFofi: ajustes.valorFofi,
        valorArbitrajeFinalLiguilla: ajustes.valorArbitrajeFinalLiguilla,
        valorTernaFinalLiguilla: ajustes.valorTernaFinalLiguilla,
        ternaFinalLiguilla: ajustes.ternaFinalLiguilla,
        valorArbitrajeMuerteSubita: ajustes.valorArbitrajeMuerteSubita,
        valorTernaMuerteSubita: ajustes.valorTernaMuerteSubita,
        ternaMuerteSubita: ajustes.ternaMuerteSubita,
        valorArbitrajeSemifinalLiguilla: ajustes.valorArbitrajeSemifinalLiguilla,
        valorTernaSemifinalLiguilla: ajustes.valorTernaSemifinalLiguilla,
        ternaSemifinalLiguilla: ajustes.ternaSemifinalLiguilla,
        valorArbitrajeSemifinalTorneo: ajustes.valorArbitrajeSemifinalTorneo,
        valorTernaSemifinalTorneo: ajustes.valorTernaSemifinalTorneo,
        ternaSemifinalTorneo: ajustes.ternaSemifinalTorneo,
        valorArbitrajeFinalTorneo: ajustes.valorArbitrajeFinalTorneo,
        valorTernaFinalTorneo: ajustes.valorTernaFinalTorneo,
        ternaFinalTorneo: ajustes.ternaFinalTorneo,
        valorMesa: ajustes.valorMesa,
        valorCintaCapitan: ajustes.valorCintaCapitan,
        valorAmarilla: ajustes.valorAmarilla,
        valorRoja: ajustes.valorRoja,
        valorCarnet: ajustes.valorCarnet,
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
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-lg">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Ajustes</h1>
          <p className="text-muted-foreground mt-1">Valores en pesos que usa todo el torneo</p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-center py-10 text-muted-foreground">Cargando...</p>
          </CardContent>
        </Card>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <Card>
                <CardContent className="p-6 space-y-5">
                  <h2 className="font-bold text-lg">Valores generales</h2>
                  {CAMPOS_GENERALES.map(({ name, label, ayuda }) => (
                    <CampoPeso key={name} control={form.control} name={name} label={label} ayuda={ayuda} />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="font-bold text-lg">Arbitrajes</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      El valor cambia según la fase del torneo. Final liguilla, muerte súbita,
                      semifinal liguilla, semifinal del torneo y la final se pueden pagar con 1
                      árbitro o con terna — se decide más cerca de la fecha, marcando la casilla
                      correspondiente.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {CAMPOS_ARBITRAJE_SIMPLE.map(({ name, label }) => (
                      <CampoPeso key={name} control={form.control} name={name} label={label} />
                    ))}
                  </div>

                  <div className="space-y-3 pt-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                      Fases que pueden ser 1 árbitro o terna
                    </p>
                    {FASES_CON_TERNA.map((fase) => (
                      <BloqueFaseConTerna key={fase.casilla} control={form.control} fase={fase} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Guardando...' : 'Guardar ajustes'}
              </Button>
            </div>
          </form>
        </Form>
      )}

      <p className="text-xs text-muted-foreground">
        Cambiar un valor acá no modifica lo que ya está guardado — por ejemplo, las tarjetas ya
        registradas conservan el valor con el que se crearon. Solo se usa el valor nuevo desde ese
        momento en adelante.
      </p>
    </div>
  );
}
