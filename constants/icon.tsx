import { Feather } from "@expo/vector-icons";
import React from "react";

export const icon = {
        index: (props: any) => (
            <Feather name='home' size={24} {...props} />
        ),
        profile: (props: any) => (
            <Feather name='user' size={24} {...props} />
        ),
    };