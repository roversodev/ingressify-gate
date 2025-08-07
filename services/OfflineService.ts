// import { api } from '@/api';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import NetInfo from '@react-native-community/netinfo';
// import { ConvexReactClient } from 'convex/react';
// import { GenericId as Id } from 'convex/values';

// // Chaves para o armazenamento
// const KEYS = {
//   EVENT_DATA: 'offline_event_data_',
//   TICKETS: 'offline_tickets_',
//   PENDING_VALIDATIONS: 'offline_pending_validations'
// };

// // Interface para validações pendentes
// interface PendingValidation {
//   ticketId: string;
//   eventId: string;
//   userId: string;
//   timestamp: number;
//   validated: boolean;
// }

// const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL!;
// const convex = new ConvexReactClient(convexUrl);

// // Classe para gerenciar o modo offline
// class OfflineService {
//   // Verificar se está online
//   async isOnline(): Promise<boolean> {
//     const state = await NetInfo.fetch();
//     return state.isConnected === true && state.isInternetReachable === true;
//   }

//   // Baixar dados do evento para uso offline
//   async downloadEventData(eventId: string, userId: string): Promise<boolean> {
//     try {
//       // Verificar se está online
//       if (!await this.isOnline()) {
//         return false;
//       }

//       // Usar query diretamente em vez de useQuery
//       const event = await convex.query(api.events.getById, { eventId: eventId as Id<"events"> });

//       // Obter ingressos do evento
//       const tickets = await convex.query(api.tickets.getEventTickets, {
//         eventId: eventId as Id<"events">,
//         userId: userId as Id<"users">
//       });

//       // Salvar dados do evento
//       await AsyncStorage.setItem(KEYS.EVENT_DATA + eventId, JSON.stringify(event));

//       // Salvar ingressos
//       await AsyncStorage.setItem(KEYS.TICKETS + eventId, JSON.stringify(tickets));

//       console.log(`Dados do evento ${eventId} baixados para uso offline`);
//       return true;
//     } catch (error) {
//       console.error('Erro ao baixar dados para uso offline:', error);
//       return false;
//     }
//   }

//   // Obter dados do evento do armazenamento local
//   async getOfflineEventData(eventId: string): Promise<any> {
//     try {
//       const eventData = await AsyncStorage.getItem(KEYS.EVENT_DATA + eventId);
//       return eventData ? JSON.parse(eventData) : null;
//     } catch (error) {
//       console.error('Erro ao obter dados offline do evento:', error);
//       return null;
//     }
//   }

//   // Obter ingressos do armazenamento local
//   async getOfflineTickets(eventId: string): Promise<any[]> {
//     try {
//       const tickets = await AsyncStorage.getItem(KEYS.TICKETS + eventId);
//       return tickets ? JSON.parse(tickets) : [];
//     } catch (error) {
//       console.error('Erro ao obter ingressos offline:', error);
//       return [];
//     }
//   }

//   // Validar ingresso offline
//   async validateTicketOffline(ticketId: string, eventId: string, userId: string): Promise<any> {
//     try {
//       // Obter ingressos do armazenamento local
//       const tickets = await this.getOfflineTickets(eventId);
//       const ticket = tickets.find((t: any) => t._id === ticketId);

//       if (!ticket) {
//         return {
//           success: false,
//           message: 'Ingresso não encontrado no armazenamento offline'
//         };
//       }

//       // Verificar se o ingresso já foi validado localmente
//       if (ticket.status === 'used') {
//         return {
//           success: false,
//           ticket,
//           message: 'Este ingresso já foi utilizado anteriormente.'
//         };
//       }

//       // Verificar se o ingresso pertence ao evento
//       if (ticket.eventId !== eventId) {
//         return {
//           success: false,
//           ticket,
//           event: { _id: eventId },
//           message: 'Este ingresso não pertence a este evento.'
//         };
//       }

//       // Marcar o ingresso como usado localmente
//       ticket.status = 'used';

//       // Atualizar o ingresso no armazenamento local
//       const updatedTickets = tickets.map((t: any) =>
//         t._id === ticketId ? ticket : t
//       );
//       await AsyncStorage.setItem(KEYS.TICKETS + eventId, JSON.stringify(updatedTickets));

//       // Adicionar à lista de validações pendentes
//       await this.addPendingValidation({
//         ticketId,
//         eventId,
//         userId,
//         timestamp: Date.now(),
//         validated: true
//       });

//       // Buscar o tipo de ingresso
//       const event = await this.getOfflineEventData(eventId);
//       const ticketType = event?.ticketTypes?.find((tt: any) => tt._id === ticket.ticketTypeId);

//       return {
//         success: true,
//         ticket,
//         ticketType,
//         offlineValidation: true
//       };
//     } catch (error) {
//       console.error('Erro ao validar ingresso offline:', error);
//       return {
//         success: false,
//         message: 'Erro ao validar ingresso no modo offline'
//       };
//     }
//   }

//   // Adicionar validação pendente
//   async addPendingValidation(validation: PendingValidation): Promise<void> {
//     try {
//       // Obter validações pendentes existentes
//       const pendingValidationsStr = await AsyncStorage.getItem(KEYS.PENDING_VALIDATIONS);
//       const pendingValidations: PendingValidation[] = pendingValidationsStr
//         ? JSON.parse(pendingValidationsStr)
//         : [];

//       // Adicionar nova validação
//       pendingValidations.push(validation);

//       // Salvar validações pendentes atualizadas
//       await AsyncStorage.setItem(KEYS.PENDING_VALIDATIONS, JSON.stringify(pendingValidations));
//     } catch (error) {
//       console.error('Erro ao adicionar validação pendente:', error);
//     }
//   }

//   // Sincronizar validações pendentes
//   async syncPendingValidations(): Promise<boolean> {
//     try {
//       // Verificar se está online
//       if (!await this.isOnline()) {
//         return false;
//       }

//       // Obter validações pendentes
//       const pendingValidationsStr = await AsyncStorage.getItem(KEYS.PENDING_VALIDATIONS);
//       if (!pendingValidationsStr) {
//         return true; // Não há validações pendentes
//       }

//       const pendingValidations: PendingValidation[] = JSON.parse(pendingValidationsStr);
//       if (pendingValidations.length === 0) {
//         return true; // Lista vazia
//       }

//       // Processar cada validação pendente
//       const results = await Promise.allSettled(
//         pendingValidations.map(async (validation) => {
//           try {
//             // Usar mutation diretamente em vez de useMutation
//             await convex.mutation(api.tickets.validateTicket, {
//               ticketId: validation.ticketId as Id<"tickets">,
//               eventId: validation.eventId as Id<"events">,
//               userId: validation.userId,
//               offlineValidated: true,
//               offlineTimestamp: validation.timestamp
//             });
//             return true;
//           } catch (error) {
//             console.error('Erro ao sincronizar validação:', error);
//             return false;
//           }
//         })
//       );

//       // Verificar resultados
//       const allSuccessful = results.every(r => r.status === 'fulfilled' && r.value === true);

//       if (allSuccessful) {
//         // Limpar validações pendentes se todas foram sincronizadas com sucesso
//         await AsyncStorage.setItem(KEYS.PENDING_VALIDATIONS, JSON.stringify([]));
//       } else {
//         // Manter apenas as validações que falharam
//         const failedValidations = pendingValidations.filter((_, index) => {
//           const result = results[index];
//           return result.status === 'rejected' || (result.status === 'fulfilled' && !result.value);
//         });
//         await AsyncStorage.setItem(KEYS.PENDING_VALIDATIONS, JSON.stringify(failedValidations));
//       }

//       return allSuccessful;
//     } catch (error) {
//       console.error('Erro ao sincronizar validações pendentes:', error);
//       return false;
//     }
//   }

//   // Obter contagem de validações pendentes
//   async getPendingValidationsCount(): Promise<number> {
//     try {
//       const pendingValidationsStr = await AsyncStorage.getItem(KEYS.PENDING_VALIDATIONS);
//       if (!pendingValidationsStr) return 0;

//       const pendingValidations: PendingValidation[] = JSON.parse(pendingValidationsStr);
//       return pendingValidations.length;
//     } catch (error) {
//       console.error('Erro ao obter contagem de validações pendentes:', error);
//       return 0;
//     }
//   }

//   // Limpar dados offline de um evento
//   async clearEventOfflineData(eventId: string): Promise<void> {
//     try {
//       await AsyncStorage.removeItem(KEYS.EVENT_DATA + eventId);
//       await AsyncStorage.removeItem(KEYS.TICKETS + eventId);
//       console.log(`Dados offline do evento ${eventId} removidos`);
//     } catch (error) {
//       console.error('Erro ao limpar dados offline do evento:', error);
//     }
//   }
// }

// export const offlineService = new OfflineService();