pragma circom 2.1.4;

include "../circomlib/poseidon.circom";

// can be used to draw a card
template Draw(nHandInputs, nDeckInputs) {
     // Private Inputs
    signal input handSalt;
    signal input hand_card_ids[nHandInputs];

    signal input deckSalt;
    signal input deck_card_ids[nDeckInputs];

    signal input card_id_drawn;
    
    // Public Inputs
    signal input handSaltHash;
    signal input hand_card_id_hashes[nHandInputs];
    signal input handCommittment; // hash of hand card ids and handSalt

    signal input deckSaltHash;
    signal input deck_card_id_hashes[nDeckInputs];
    signal input deckCommittment; // hash of deck card ids and deckSalt
    
    component handHash[nHandInputs];
    component handCommittmentHasher = Poseidon(nHandInputs);
    component handSaltHasher = Poseidon(1);

    component deckHash[nDeckInputs];
    component deckCommittmentHasher = Poseidon(nDeckInputs);
    component deckSaltHasher = Poseidon(1);

    // assert that PubhandSaltHash is the hash of the handSalt
    handSaltHasher.inputs[0] <== handSalt;
    handSaltHasher.out === handSaltHash;

    // repeat with deck
    deckSaltHasher.inputs[0] <== deckSalt;
    deckSaltHasher.out === deckSaltHash;

    // assert that each pub hash id is equal to the hash of the secret input id 
    // Ensures that the cards and deck are the same and we did not secretly swap out a card
    for(var i = 0; i < nHandInputs; i++){
        handHash[i] = Poseidon(1);
        handHash[i].inputs[0] <== hand_card_ids[i];
        handHash[i].out === hand_card_id_hashes[i];

        if(i == nHandInputs - 1){
            handCommittmentHasher.inputs[i] <== handSalt;
        }
        else{
            handCommittmentHasher.inputs[i] <== hand_card_ids[i];
        }
    }

    for(var i = 0; i < nDeckInputs; i++){
        deckHash[i] = Poseidon(1);
        deckHash[i].inputs[0] <== deck_card_ids[i];
        deckHash[i].out === deck_card_id_hashes[i];

        if(i == nDeckInputs - 1){
            deckCommittmentHasher.inputs[i] <== deckSalt;
        }
        else{
            deckCommittmentHasher.inputs[i] <== deck_card_ids[i];
        }
    }

    // assert that the handCommittment and deckCommittment lines up with the hash provided
   handCommittmentHasher.out === handCommittment;
   deckCommittmentHasher.out === deckCommittment;

    // ensures that card id that we are drawing isn't being swapped for another card id
   signal card_id_drawn_squared;
   card_id_drawn_squared <== card_id_drawn * card_id_drawn;
}

// number of cards in hand
component main { public [ handSaltHash, hand_card_id_hashes, handCommittment, deckSaltHash, deck_card_id_hashes, deckCommittment] } = Draw(6, 12);

