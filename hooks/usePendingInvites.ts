import { api } from '@/api';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';

export function usePendingInvites() {
  const { user } = useUser();
  
  // Buscar convites pendentes do banco de dados usando o email do usuário
  const allInvitations = useQuery(
    api.validators.getValidatorInvitationsByEmail,
    user?.emailAddresses?.[0]?.emailAddress 
      ? { email: user.emailAddresses[0].emailAddress }
      : "skip"
  );

  // Filtrar apenas convites pendentes
  const pendingInvites = allInvitations?.filter(
      (    invitation: { status: string; }) => invitation.status === "pending"
  ) || [];

  return {
    pendingInvites,
    isLoading: allInvitations === undefined,
    hasPendingInvites: pendingInvites.length > 0
  };
}