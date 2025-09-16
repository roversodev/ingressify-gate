import { useUser } from '@clerk/clerk-expo';
import { useMutation } from 'convex/react';
import React, { useEffect } from 'react';
import { api } from '../api';
import UserProfileModal from './UserProfileModal';

export default function SyncUserWithConvex() {
  const { user } = useUser();
  const updateUser = useMutation(api.users.updateUser);

  useEffect(() => {
    if (!user) return;

    const syncUser = async () => {
      try {
        // Adapte esta chamada para sua API
        await updateUser({
          userId: user.id,
          name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
          email: user.emailAddresses[0]?.emailAddress ?? "",
        });
      } catch (error) {
        console.error("Error syncing user:", error);
      }
    };

    syncUser();
  }, [user]);

  // Renderizar o modal de perfil junto com o componente
  return <UserProfileModal />;
}