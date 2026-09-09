import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { UserX, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { deleteSeparationRule, fetchAllSeparationRules } from './api'

/** Read-only, club-wide list of every "never on the same training team" pair — for
 * checking nothing was forgotten before a generation, without hunting through individual
 * fiches. Creating a rule still happens from PlayerDetailDialog (a player is the natural
 * starting point when declaring who they can't play with); this view only lists and
 * removes. */
export function SeparationRulesPanel() {
  const queryClient = useQueryClient()
  const rulesQuery = useQuery({ queryKey: ['admin', 'separation-rules'], queryFn: fetchAllSeparationRules })

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => deleteSeparationRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'separation-rules'] })
      queryClient.invalidateQueries({ queryKey: ['separation-rules'] })
    },
  })

  const rules = rulesQuery.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jamais dans la même équipe</CardTitle>
        <CardDescription>
          {rules.length} règle{rules.length !== 1 ? 's' : ''} — appliquées automatiquement à chaque
          génération d'équipes. Pour en ajouter une, ouvre la fiche d'un joueur depuis l'onglet Vue
          d'ensemble.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rules.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Aucune règle pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Joueur</TableHead>
                <TableHead />
                <TableHead>Joueur</TableHead>
                <TableHead>Créée le</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.userAFirstName} {r.userALastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground w-8">
                    <UserX className="size-3.5" />
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.userBFirstName} {r.userBLastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(r.createdAt), 'd MMM yyyy', { locale: fr })}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={deleteRuleMutation.isPending}
                      onClick={() => deleteRuleMutation.mutate(r.id)}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                      aria-label="Retirer cette règle"
                    >
                      <X className="size-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
