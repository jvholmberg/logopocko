import { createServer } from "http";
import express from "express";
import { ApolloServer, gql } from "apollo-server-express";

import prisma from "./prisma/client";

const startServer = async () => {
  const app = express()
  const httpServer = createServer(app)

  const typeDefs = gql`
    scalar Date
    scalar DateTime

    type Mutation {
      CreateUser($username: String!, $password: String!, $passwordVerify: String!) {
        createUser($username, $password, $passwordVerify)
      }
    }

    type Query {
      conversations: [Conversation]
    }

    type User {
      id: ID!
      username: String!
      password: String
      createdAt: Date!
      updatedAt: Date!
    }

    type Conversation {
      id: ID!
      name: Int
      users: [ConversationUser!]!
      createdAt: Date!
      updatedAt: Date!
    }

    type ConversationUser {
      user: User!
      role: ConversationUserRole!
      deleted: Boolean
      createdAt: Date!
      updatedAt: Date!
    }

    type ConversationUserRole {
      id: ID!
      name: String
    }
  `;

  const resolvers = {
    Mutation: {
      createPost(username: string, password: string, passwordVerify: string) {

      }
    },
    Query: {
      conversations: (userId: string) => {
        return prisma.conversationUser.findMany({
          where: { userId },
          include: {
            conversation: true,
            user: true,
            role: true,
          },
        });
      },
      // conversationById: (conversationId: string) => {
      //   return prisma.conversation.findUnique({
      //     where: { id: conversationId }
      //   });
      // },
    },
  };
  
  // Load configuration for Apollo
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
  })

  // Start Apollo
  await apolloServer.start()
  apolloServer.applyMiddleware({ app });

  // Start Server
  const port = process.env.PORT || 4000;
  httpServer.listen({ port }, () =>
    console.log(`🚀 Server listening at localhost:${port}${apolloServer.graphqlPath}`)
  )
}

startServer()