import { Feather } from "@expo/vector-icons";
import React from "react";

export const icon = {
        index: ({color, ...props}: any) => (
            <Feather name='home' size={24} color={color} {...props} />
        ),
        profile: ({color, ...props}: any) => (
            <Feather name='user' size={24} color={color} {...props} />
        ),
    };