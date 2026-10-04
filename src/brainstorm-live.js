// Retain the deployed class and its stored history without exposing a room.
export class BrainstormLive {
  constructor(state){for(const socket of state.getWebSockets?.()||[])socket.close(1000,'Cet espace a été retiré.');}
  async fetch(){return new Response('Cet espace a été retiré.',{status:410});}
  webSocketMessage(socket){socket.close(1000,'Cet espace a été retiré.');}
}
