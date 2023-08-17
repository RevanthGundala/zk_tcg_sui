import {
  Box,
  Text,
  Flex,
  Link,
  VStack,
  Textarea,
  Spinner,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback } from "react";
import {
  ethos,
  TransactionBlock,
  SignInButton,
  Wallet,
  EthosConnectStatus,
} from "ethos-connect";
import { GetServerSideProps } from "next";
import {
  MAX_HAND_SIZE,
  MODULE_ADDRESS,
  STARTING_DECK_SIZE,
  TOTAL_DECK_SIZE,
} from "../constants/index";
import { accept_challenge, draw } from "../calls/move_calls";
import { get_object_ids } from "../calls/api_calls";
import { get_object_from_id } from "../calls/api_calls";
// import { useSuiProvider } from "@suiet/wallet";

interface PlayerContract {
  fields: {
    addr: string;
    board: string[];
    deck_commitment: string;
    deck_size: number;
    graveyard: string[];
    hand_commitment: string;
    hand_size: number;
    id: string;
    life: number;
  };
}

interface PlayerBackend {
  address: string;
  hand: string[];
  deck: string[];
}

interface id {
  id: string;
}

export default function Challenges() {
  const { wallet, provider } = ethos.useWallet();
  const [challengers, setChallengers] = useState<string[]>([]);
  const [challenges, setChallenges] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  const create_game = async (
    player_2_address: string,
    player_1_address: string
  ) => {
    // when someone calls create_game, I know that p2 is the accepter, and p1 owns the object

    let player_1: PlayerBackend = {
      address: player_1_address,
      hand: [],
      deck: [],
    };

    let player_2: PlayerBackend = {
      address: player_2_address,
      hand: [],
      deck: [],
    };
    let nfts = wallet?.contents?.nfts;
    let owned_objects;
    let id: id;

    if (player_2_address === wallet?.address) {
      nfts?.forEach((nft) => {
        if (
          nft !== undefined &&
          nft.type === `${MODULE_ADDRESS}::card_game::Card` &&
          typeof nft.fields?.id === "object"
        ) {
          id = nft.fields?.id as id;
          player_2.deck.push(id.id);
        }
      });
      player_2.deck.slice(0, TOTAL_DECK_SIZE);

      // logic if we are player 1
      owned_objects = await provider?.getOwnedObjects({
        owner: player_1_address,
        options: { showType: true },
      });
      const filteredNfts = owned_objects?.data.filter((nft) => {
        return (
          nft !== undefined &&
          nft?.data?.type === `${MODULE_ADDRESS}::card_game::Card`
        );
      });
      // console.log("p1 filtered obj: " + JSON.stringify(filteredNfts, null, 2));
      filteredNfts?.forEach((nft) => {
        player_1.deck.push(nft.data?.objectId || "");
      });
      player_1.deck.slice(0, TOTAL_DECK_SIZE);
    }

    // move cards from deck to hand in random way
    while (player_1.hand.length < MAX_HAND_SIZE) {
      let index: number = Math.floor(Math.random() * TOTAL_DECK_SIZE);
      if (player_1.deck[index] !== undefined) {
        player_1.hand.push(player_1.deck[index]);
      }
      player_1.deck.splice(index, 1);
    }
    while (player_2.hand.length < MAX_HAND_SIZE) {
      let index: number = Math.floor(Math.random() * TOTAL_DECK_SIZE);
      if (player_2.deck[index] !== undefined) {
        player_2.hand.push(player_2.deck[index]);
      }
      player_2.deck.splice(index, 1);
    }

    // player_1.hand = player_1.hand.filter((id) => id !== undefined);
    // player_2.hand = player_2.hand.filter((id) => id !== undefined);

    // player_1.hand.forEach((id) => console.log("p1 hand id: " + id));
    // player_2.hand.forEach((id) => console.log("p2 hand id: " + id));

    // get card objects from ids
    player_1.deck.map(async (id: string) => {
      (await provider?.getObject({ id: id, options: { showContent: true } }))
        ?.data?.content;
    });

    player_1.hand.map(async (id: string) => {
      (await provider?.getObject({ id: id, options: { showContent: true } }))
        ?.data?.content;
    });

    player_2.deck.map(async (id: string) => {
      (await provider?.getObject({ id: id, options: { showContent: true } }))
        ?.data?.content;
    });

    player_2.hand.map(async (id: string) => {
      (await provider?.getObject({ id: id, options: { showContent: true } }))
        ?.data?.content;
    });

    console.log("p1 hand: " + player_1.hand.length);
    console.log("p2 hand: " + player_2.hand.length);
    console.log("p1 deck: " + player_1.deck.length);
    console.log("p2 deck: " + player_2.deck.length);

    const response = await fetch("http://localhost:5002/api/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        player_1: player_1,
        player_2: player_2,
      }),
    });
    if (!response.ok) {
      throw new Error(response.status.toString());
    }
    const result = await response.text();
    console.log(result);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        wallet?.contents?.objects?.forEach(async (object) => {
          if (
            object.type === `${MODULE_ADDRESS}::card_game::Challenge` &&
            !challenges.includes(object.objectId) &&
            !challengers.includes(object.fields?.challenger || "")
          ) {
            console.log("New challenge");
            challenges.push(object.objectId);
            challengers.push(object.fields?.challenger || "");
          }
          // they accepted our challenge -> player 2 accepts always
          // check if we own a game object = game started-> router.push
          else if (object.type === `${MODULE_ADDRESS}::card_game::Game`) {
            console.log("found");
            if (wallet && object.fields?.player_2) {
              let player2: PlayerContract | undefined;

              if (typeof object.fields.player_2 === "object") {
                player2 = object.fields.player_2 as PlayerContract;
              }

              if (player2) {
                router.push("/game/" + object.objectId);
              }
            }
          }
        });
        // setIsLoading(false);
      } catch (error) {
        console.log(error);
      }
    };
    fetchData();
  }, [challenges]);

  return (
    <Box textAlign="center">
      <Text fontSize="4xl" fontWeight="bold" mt={4}>
        Challenges
      </Text>
      <Box>
        <VStack spacing="20px">
          {isLoading || challenges === undefined ? (
            <Box>
              <Spinner size="xl" />
              <Text fontWeight={"bold"}>Searching...</Text>
            </Box>
          ) : (
            <Box>
              {challenges.map((challenge, index) => (
                <Box
                  key={index}
                  onClick={async () => {
                    let game_id = await accept_challenge(wallet, challenge);
                    if (wallet) {
                      await create_game(wallet.address, challengers[index]);
                    }
                    router.push("/game/" + game_id);
                  }}
                >
                  <Text fontWeight={"bold"}>
                    Challenger: {ethos.truncateMiddle(challengers[index], 4)}
                  </Text>
                  <br />
                </Box>
              ))}
            </Box>
          )}
        </VStack>
      </Box>
    </Box>
  );
}
